# Neon Catapult Design

## Decision

Build a self-contained 3D catapult mini-game as a new `/catapult` route, preserving the existing portfolio homepage. The first version uses Three.js with procedural geometry and a lightweight custom physics loop, avoiding new runtime dependencies where possible.

The game loop is: aim by dragging the catapult band, release to launch a projectile, hit targets and destructible blocks, earn points, and restart or advance through a small set of handcrafted levels. The visual direction is a playful synthwave toy diorama that matches bigf.me's dark terminal palette without replacing the site's existing workspaces.

## Player Experience

- A full-viewport 3D scene with a low-poly catapult, floating platforms, targets, and a distant neon skyline.
- A clear HUD showing level, shots remaining, score, trajectory hint, and restart control.
- Dragging on the catapult changes launch angle and power. Releasing launches the projectile.
- The projectile follows a visible parabolic arc, collides with targets and blocks, and settles or falls out of bounds.
- Targets award points and trigger a readable hit effect. Blocks wobble and break after sufficient impact.
- Three short levels increase distance and obstacle complexity. Completing a level presents a next-level action; running out of shots presents retry.
- Keyboard controls provide an accessible alternative: arrow keys adjust aim, Space launches, R restarts.
- `prefers-reduced-motion` disables decorative camera shake and excessive particle motion while preserving gameplay.

## Architecture

- `src/pages/catapult.astro`: route shell, HUD markup, accessible instructions, and game mount point.
- `src/components/CatapultGame.astro`: client-side game module containing scene setup, input handling, simulation, rendering, level state, and teardown.
- `src/styles/global.css`: only small shared additions if required; game-specific styles stay colocated with the component.
- Three.js is loaded through an existing project dependency if present; otherwise add the minimal `three` dependency and lockfile update required by the package manager already used by the repository.

The game module keeps responsibilities separated internally:

1. Scene factory creates renderer, camera, lights, materials, ground, catapult, targets, blocks, and backdrop.
2. Input controller converts pointer and keyboard input into normalized aim/power state.
3. Simulation updates projectile position, gravity, collision checks, damage, scoring, and level transitions.
4. HUD adapter renders state changes into DOM and exposes restart/next-level actions.
5. Animation loop advances simulation and renders frames, stopping when the page is hidden and disposing resources on teardown.

## Data Flow

Level definitions are immutable data objects containing catapult position, projectile limits, target transforms, block transforms, and environment settings. A launch snapshots the current aim and power into projectile velocity. Each animation frame applies gravity, updates the projectile, checks simple sphere/AABB collisions, mutates runtime object state, and sends score/status changes to the HUD. A level reset rebuilds only runtime entities while reusing renderer, camera, and shared materials.

## Failure and Edge Handling

- If WebGL is unavailable, show a styled fallback panel explaining that the game requires a WebGL-capable browser, with a link back home.
- Clamp aim, power, device-pixel ratio, and frame delta to stable ranges.
- Ignore launches while a projectile is active or while a level transition is pending.
- Reset a projectile after it leaves the play bounds or remains stationary for a timeout.
- Handle resize and orientation changes without breaking the HUD or scene framing.
- Do not depend on remote textures, models, audio, or APIs, so the game remains playable offline after the page loads.

## Validation

- Run `npm run build` to verify Astro compilation and route generation.
- Use a browser smoke test to confirm `/catapult` loads, the fallback does not appear in a supported browser, pointer drag/release launches a projectile, keyboard controls work, targets affect score, shots decrement, restart works, and level completion/retry states render.
- Check desktop and narrow viewport layouts, plus reduced-motion behavior.
- Confirm existing `/` and other routes still build unchanged.
