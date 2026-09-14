import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp, dampAngle, lerp } from '../utils/math';
import type { CarController } from '../vehicle/CarController';
import { MAX_SPEED } from '../vehicle/CarController';
import type { CarModel } from '../vehicle/CarModel';

export type CameraModeId = 'chase' | 'far' | 'hood' | 'cinematic';

interface CameraMode {
  id: CameraModeId;
  label: string;
  distance: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
  fov: number;
  /** How quickly the camera catches up (lower = floatier). */
  lag: number;
}

export const CAMERA_MODES: CameraMode[] = [
  { id: 'chase', label: 'Chase', distance: 7.4, height: 2.55, lookAhead: 9, lookHeight: 1.15, fov: 58, lag: 4.5 },
  { id: 'far', label: 'Wide', distance: 13.5, height: 4.6, lookAhead: 13, lookHeight: 1.4, fov: 52, lag: 3.2 },
  { id: 'hood', label: 'Low', distance: 4.6, height: 1.35, lookAhead: 11, lookHeight: 1.0, fov: 62, lag: 6.5 },
  { id: 'cinematic', label: 'Cinematic', distance: 9.5, height: 2.2, lookAhead: 7, lookHeight: 1.1, fov: 46, lag: 2.2 },
];

/**
 * Third-person camera. It follows a smoothed version of the car's heading rather than the car
 * itself, which keeps corners flowing instead of snapping, and eases back after a mouse drag.
 */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  modeIndex = 0;
  /** Extra yaw/pitch from dragging the mouse. */
  private orbitYaw = 0;
  private orbitPitch = 0;
  private orbitTarget = { yaw: 0, pitch: 0 };
  private orbitHold = 0;
  private cinematicAngle = 0;
  private heading = 0;
  private readonly position = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly desired = new Vector3();
  private readonly wanted = new Vector3();
  private initialised = false;

  constructor(aspect: number, far: number) {
    this.camera = new PerspectiveCamera(58, aspect, 0.3, far);
  }

  get mode(): CameraMode {
    return CAMERA_MODES[this.modeIndex];
  }

  cycleMode(): CameraMode {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    return this.mode;
  }

  setMode(id: CameraModeId): void {
    const i = CAMERA_MODES.findIndex((m) => m.id === id);
    if (i >= 0) this.modeIndex = i;
  }

  /** Mouse drag, in radians. */
  orbit(dYaw: number, dPitch: number): void {
    this.orbitTarget.yaw = clamp(this.orbitTarget.yaw + dYaw, -Math.PI * 0.85, Math.PI * 0.85);
    this.orbitTarget.pitch = clamp(this.orbitTarget.pitch + dPitch, -0.35, 0.75);
    this.orbitHold = 2.2;
  }

  update(dt: number, car: CarModel, controller: CarController, groundY: number): void {
    const mode = this.mode;

    // Ease the orbit back to neutral shortly after the player lets go.
    this.orbitHold = Math.max(0, this.orbitHold - dt);
    if (this.orbitHold === 0) {
      this.orbitTarget.yaw = damp(this.orbitTarget.yaw, 0, 1.4, dt);
      this.orbitTarget.pitch = damp(this.orbitTarget.pitch, 0, 1.4, dt);
    }
    this.orbitYaw = damp(this.orbitYaw, this.orbitTarget.yaw, 7, dt);
    this.orbitPitch = damp(this.orbitPitch, this.orbitTarget.pitch, 7, dt);

    const carHeading = car.group.rotation.y;
    this.heading = this.initialised ? dampAngle(this.heading, carHeading, mode.lag, dt) : carHeading;

    let yaw = this.heading + this.orbitYaw;
    let pitch = this.orbitPitch;
    if (mode.id === 'cinematic') {
      // A slow, continuous drift around the car.
      this.cinematicAngle += dt * 0.12;
      yaw += Math.sin(this.cinematicAngle) * 0.85;
      pitch += 0.12 + Math.sin(this.cinematicAngle * 0.7) * 0.1;
    }

    const speedT = clamp(controller.speed / MAX_SPEED, 0, 1);
    const distance = mode.distance * (1 + speedT * 0.12);
    const height = mode.height + pitch * 6;
    const carPos = car.group.position;
    this.desired.set(
      carPos.x - Math.sin(yaw) * distance,
      carPos.y + height,
      carPos.z - Math.cos(yaw) * distance,
    );
    // Never let the camera sink into the road surface.
    this.desired.y = Math.max(this.desired.y, groundY + 0.9);

    if (!this.initialised) {
      this.position.copy(this.desired);
      this.lookAt.copy(carPos);
      this.initialised = true;
    }
    this.position.lerp(this.desired, 1 - Math.exp(-mode.lag * dt));

    this.wanted.set(
      carPos.x + Math.sin(this.heading) * mode.lookAhead,
      carPos.y + mode.lookHeight,
      carPos.z + Math.cos(this.heading) * mode.lookAhead,
    );
    this.lookAt.x = damp(this.lookAt.x, this.wanted.x, mode.lag * 1.3, dt);
    this.lookAt.y = damp(this.lookAt.y, this.wanted.y, mode.lag * 1.3, dt);
    this.lookAt.z = damp(this.lookAt.z, this.wanted.z, mode.lag * 1.3, dt);

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
    const targetFov = mode.fov + speedT * 7;
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-2 * dt));
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
