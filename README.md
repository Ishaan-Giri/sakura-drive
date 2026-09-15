# 桜ドライブ · Sakura Drive

LINK: https://ishaan-giri.github.io/sakura-drive/

A soothing third-person driving game for the browser. You cruise an endless road through Japanese
spring — cherry blossom avenues, riversides, rice fields, villages, bamboo groves and tunnels of
vermilion torii gates — while petals drift past and music plays.

There is no timer, no traffic, no score and no way to fail. The car cannot leave the road: run wide
and the verge simply steers you back. Press **Space** and it drives itself, so you can just watch.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the built bundle
```

`dist/` is a static folder — deploy it to Vercel, Netlify, GitHub Pages or any static host.
The build uses a relative base, so it works from a sub-path too.

A GitHub Pages workflow is included at `.github/workflows/deploy.yml`. To switch it on, go to
**Settings → Pages → Source → GitHub Actions**; every push to `main` then publishes the game.

Requires WebGL 2 (any recent Chrome, Edge, Firefox or Safari). Designed for desktop / laptop.

## Controls

| | |
|---|---|
| `W` `S` / `↑` `↓` | Accelerate, brake — in cruise, adjust the set speed |
| `A` `D` / `←` `→` | Steer |
| `Space` | Cruise control on/off |
| `C` | Camera: chase → wide → low → cinematic |
| `N` `B` | Next / previous track |
| `M` | Mute music |
| `H` | Hide the HUD |
| `Esc` | Pause and settings |
| Mouse drag | Look around (eases back when you let go) |
| `F3` | FPS overlay |

A gamepad works too: left stick steers, triggers drive, **A** cruises, **Y** changes camera,
bumpers change track.

## Music

The game ships with no music files. Drop your own into `public/music/` and list them in
`public/music/playlist.json` — see the [notes there](public/music/README.md) for the format and a
list of places to find soothing, legally usable tracks.

Until you add any, a small built-in generative ambient station plays instead, so it is never silent.
The player streams files, shuffles, crossfades over ~3 seconds and supports OS media keys.

## How it works

Everything you see is generated in code — there are no downloaded 3D models or textures.

- **The road** (`src/world/Road.ts`) is endless and deterministic: heading and elevation are smooth
  noise functions of the distance travelled, tuned so the tightest bend is ~200 m radius and grades
  stay under 6%. Only the centre-line position is integrated, one sample per metre.
- **Biomes** (`src/world/Biomes.ts`) are a lazily generated sequence along that road. Boundaries
  cross-fade: terrain shape, colours and every prop's placement probability blend over ~90 m, so one
  landscape dissolves into the next instead of switching.
- **The world streams in chunks** of 100 m (`src/world/Chunk.ts`, `ChunkManager.ts`), a couple built
  per frame and disposed behind you. Each chunk's geometry is built relative to its own origin, which
  is what keeps float32 precision intact hundreds of kilometres out.
- **Driving** (`src/vehicle/CarController.ts`) happens in road coordinates — distance `s`, lateral
  offset `x`, heading relative to the road — so there is no physics engine, no collision, and no way
  to get lost. The verge applies a speed-scaled steering correction, and `x` is hard-limited inside
  the tarmac.
- **Petals** (`src/world/Petals.ts`) are one instanced draw call, animated entirely in the vertex
  shader and wrapped into a box that follows the camera, so they stay stable in world space forever.
- **Ambience** (`src/audio/Ambience.ts`) — engine, wind, tyre rumble on the verge and occasional
  birdsong — is synthesized in Web Audio. No audio assets.

Quality presets (Low/Medium/High, or Auto from the GPU string) control draw distance, shadows, petal
count and prop density, and an adaptive resolution scaler quietly drops the pixel ratio if frames get
slow. Bloom and vignette load lazily, only on High.

`window.game.debug` exposes the controller, renderer info, current biome and a `teleport(metres)`
helper for poking at the world from the console.

## Adding more cars

`src/vehicle/CarModel.ts` builds the car from 2D side profiles extruded to width, plus wheels and
trim. `CARS` is a list of `CarSpec`s (paint, glass, rim colours, wheel radius, wheelbase) — adding an
entry is enough for a new colourway, and the profile functions can be swapped per spec for a
different silhouette. A car picker in the pause menu is the natural next step.

## Ideas not built yet

Day–night cycle with lanterns glowing at dusk, light rain, a photo mode, and a car selection screen.
