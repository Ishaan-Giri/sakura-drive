import { Euler, Matrix4, Vector3 } from 'three';
import { LANE_OFFSET, ROAD_HALF_WIDTH, makeFrame, type Road, type RoadFrame } from '../world/Road';
import { clamp, damp } from '../utils/math';
import type { CarModel } from './CarModel';

export const MAX_SPEED = 22.2; // m/s ≈ 80 km/h
export const MIN_CRUISE = 5.6; // 20 km/h
/** The car is never allowed past this lateral offset, so it can never leave the road. */
const MAX_LATERAL = 4.1;
const SOFT_EDGE = 3.1;

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
}

/**
 * Arcade driving in road coordinates: distance along the centre line (`s`), lateral offset (`x`)
 * and heading relative to the road (`yaw`). There is no collision and no way off the tarmac —
 * the verge just nudges you back — which is the whole point of the game.
 */
export class CarController {
  s = 40;
  x = LANE_OFFSET;
  yaw = 0;
  speed = 0;
  /** Smoothed steering input, for both handling feel and the front wheel angle. */
  steerAngle = 0;
  cruise = true;
  cruiseSpeed = 15.3; // 55 km/h
  /** True while the verge is rumbling under the tyres. */
  onVerge = false;

  private readonly frame: RoadFrame = makeFrame();
  private lateralG = 0;
  private longG = 0;
  private rollView = 0;
  private pitchView = 0;
  private manualSteerTimer = 0;
  private readonly basis = new Matrix4();
  private readonly euler = new Euler();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly localUp = new Vector3();
  private readonly negRight = new Vector3();

  constructor(private readonly road: Road) {}

  get position(): RoadFrame {
    return this.frame;
  }

  /** Speed in km/h, for the HUD. */
  get kmh(): number {
    return this.speed * 3.6;
  }

  setCruise(on: boolean): void {
    this.cruise = on;
    if (on) this.cruiseSpeed = clamp(Math.max(this.speed, MIN_CRUISE), MIN_CRUISE, MAX_SPEED);
  }

  adjustCruise(delta: number): void {
    this.cruiseSpeed = clamp(this.cruiseSpeed + delta, MIN_CRUISE, MAX_SPEED);
  }

  update(dt: number, input: DriveInput, car: CarModel): void {
    const road = this.road;
    let { throttle, brake, steer } = input;

    if (Math.abs(steer) > 0.05) this.manualSteerTimer = 1.6;
    else this.manualSteerTimer = Math.max(0, this.manualSteerTimer - dt);

    if (this.cruise) {
      // Hold the set speed, and steer back to the lane centre when hands are off.
      const err = this.cruiseSpeed - this.speed;
      throttle = clamp(err * 0.35, 0, 1);
      brake = clamp(-err * 0.25, 0, 0.4);
      if (this.manualSteerTimer === 0) {
        // Positive yaw points left, so aim left when we are right of the lane centre.
        const wanted = clamp((this.x - LANE_OFFSET) * 0.09, -0.35, 0.35);
        steer = clamp((wanted - this.yaw) * 3.2, -0.7, 0.7);
      }
    }

    // --- longitudinal -------------------------------------------------------
    const power = 7.4 * (1 - Math.pow(this.speed / MAX_SPEED, 2.2) * 0.85);
    const drag = 0.012 * this.speed * this.speed + 0.45;
    let accel = throttle * power - brake * 9 - (this.speed > 0.05 ? drag : 0);
    // Gravity on hills, and a gentle slowdown on the verge.
    accel -= this.frame.slope * 9.81 * 0.55;
    if (this.onVerge) accel -= 1.6;
    this.speed = Math.max(0, this.speed + accel * dt);
    if (this.speed > MAX_SPEED) this.speed = MAX_SPEED;

    // --- steering -----------------------------------------------------------
    // Less lock at speed keeps the car calm and stops twitchy inputs from upsetting it.
    const lock = 0.46 - 0.33 * clamp(this.speed / MAX_SPEED, 0, 1);
    this.steerAngle = damp(this.steerAngle, clamp(steer, -1, 1) * lock, 7, dt);
    const wheelbase = car.spec.wheelbase;
    const yawRate = (this.speed / wheelbase) * Math.tan(this.steerAngle);

    // --- integrate in road coordinates --------------------------------------
    road.frame(this.s, this.frame);
    const k = this.frame.curvature;
    const denom = Math.max(0.2, 1 + k * this.x);
    const ds = (this.speed * Math.cos(this.yaw)) / denom;
    this.s += ds * dt;
    this.x += -this.speed * Math.sin(this.yaw) * dt;
    this.yaw += (yawRate - k * ds) * dt;

    // Soft verge: the camber of the shoulder steers the car back towards the tarmac. This is a
    // steering effect, so it scales with speed — a stationary car must never rotate on the spot.
    const over = Math.abs(this.x) - SOFT_EDGE;
    this.onVerge = Math.abs(this.x) > ROAD_HALF_WIDTH - 0.55 && this.speed > 1;
    if (over > 0) {
      const push = Math.min(1, over / (MAX_LATERAL - SOFT_EDGE));
      this.yaw += Math.sign(this.x) * push * 0.09 * this.speed * dt;
    }
    if (Math.abs(this.x) > MAX_LATERAL) {
      this.x = Math.sign(this.x) * MAX_LATERAL;
      // Cancel any outward heading so the car slides along the limit instead of stopping dead.
      if (Math.sign(Math.sin(this.yaw)) === -Math.sign(this.x)) this.yaw *= 0.55;
    }
    // Never let the car end up pointing across the road.
    this.yaw = clamp(this.yaw, -0.5, 0.5);

    // --- place the model ----------------------------------------------------
    road.frame(this.s, this.frame);
    const f = this.frame;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward = road tangent rotated by the car's yaw, then tilted by the road's slope.
    this.forward.set(f.tx * cos - f.rx * sin, 0, f.tz * cos - f.rz * sin).normalize();
    this.forward.y = f.slope;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    this.localUp.crossVectors(this.right, this.forward).normalize();
    // Model faces +Z, and its local +X points left, hence the negated right vector.
    this.negRight.copy(this.right).negate();
    this.basis.makeBasis(this.negRight, this.localUp, this.forward);
    this.euler.setFromRotationMatrix(this.basis);
    car.group.rotation.copy(this.euler);
    car.group.position.set(f.x + f.rx * this.x, f.y + 0.02, f.z + f.rz * this.x);

    // --- cosmetic body movement --------------------------------------------
    const lateralAccel = yawRate * this.speed;
    this.lateralG = damp(this.lateralG, lateralAccel, 5, dt);
    this.longG = damp(this.longG, accel, 4, dt);
    this.rollView = damp(this.rollView, clamp(this.lateralG * 0.018, -0.06, 0.06), 6, dt);
    this.pitchView = damp(this.pitchView, clamp(this.longG * 0.012, -0.05, 0.05), 5, dt);
    car.setAttitude(this.rollView, this.pitchView);
    car.setSteer(this.steerAngle * 1.1);
    car.spinWheels(this.speed * dt);
  }
}
