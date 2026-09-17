# Neon Catapult Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained, playable Three.js catapult game at `/catapult` without changing the existing portfolio workspaces.

**Architecture:** Add a route shell with accessible HUD and a focused `CatapultGame.astro` client module. The module uses procedural Three.js geometry, immutable level data, a custom deterministic physics loop, DOM HUD updates, and explicit teardown. No external assets, APIs, textures, or audio are required.

**Tech Stack:** Astro 6, Three.js, TypeScript in Astro client scripts, existing Tailwind/global CSS, Playwright browser smoke testing.

## Global Constraints

- Preserve the existing homepage and other routes.
- Use procedural geometry and no remote assets or APIs.
- Clamp aim, power, device-pixel ratio, and frame delta.
- Ignore launches while a projectile is active or a level transition is pending.
- Support pointer drag/release and keyboard arrows, Space, and R.
- Respect `prefers-reduced-motion` for camera shake and decorative particles.
- Show a WebGL fallback with a link to `/` when WebGL is unavailable.
- Run `npm run build` before completion.

---

## File Map

- Create `src/pages/catapult.astro`: `/catapult` route, HUD, instructions, action buttons, game mount.
- Create `src/components/CatapultGame.astro`: scene, levels, input, simulation, render loop, HUD bridge, cleanup.
- Modify `package.json`: add `three` only if not already available.
- Modify `package-lock.json` or `pnpm-lock.yaml`: update the lockfile used by the repository's chosen package manager.
- Create `tests/catapult.spec.ts`: Playwright smoke coverage if the project test setup supports direct browser tests.
- Do not modify `src/pages/index.astro` unless a minimal navigation link is required by the route UX.

### Task 1: Add the route shell and dependency

**Files:**
- Create: `src/pages/catapult.astro`
- Modify: `package.json` and the active lockfile only if needed

**Interfaces:**
- Produces `#catapult-game`, `#catapult-hud`, `#level-value`, `#shots-value`, `#score-value`, `#status-value`, `#restart-button`, and `#next-level-button` DOM elements.
- `CatapultGame` later consumes `#catapult-game` and the HUD element IDs.

- [ ] Add `three` to dependencies only after confirming it is absent, using the repository's package manager.
- [ ] Create a `Layout`-based route with a full-viewport dark synthwave shell, an accessible heading, concise controls text, HUD readouts, restart/next-level buttons, and a `<div id="catapult-game" aria-label="3D catapult game"></div>` mount.
- [ ] Keep the game responsive: HUD remains readable on narrow screens and the canvas fills available viewport space.
- [ ] Run `npm run build` and verify Astro generates `/catapult`.
- [ ] Commit only if the user explicitly requests git mutations; otherwise leave the working tree uncommitted.

### Task 2: Define levels and scene construction

**Files:**
- Modify: `src/components/CatapultGame.astro`

**Interfaces:**
- Define `type LevelDefinition = { name: string; shots: number; targets: Array<{ position: [number, number, number]; radius: number; points: number }>; blocks: Array<{ position: [number, number, number]; size: [number, number, number]; hits: number }>; }`.
- Define `const LEVELS: readonly LevelDefinition[]` with three levels.
- Define `createGameScene(container: HTMLElement, level: LevelDefinition): SceneRuntime` where `SceneRuntime` exposes `scene`, `camera`, `renderer`, `catapult`, `projectile`, `targets`, `blocks`, and `dispose()`.

- [ ] Create three handcrafted levels with progressively farther targets and more blocks.
- [ ] Instantiate a WebGL renderer, perspective camera, ambient/directional lights, procedural ground/platforms, low-poly catapult, projectile, target meshes, block meshes, and a simple neon skyline/backdrop.
- [ ] Use shared materials and geometry where practical; set renderer pixel ratio to `Math.min(window.devicePixelRatio, 2)`.
- [ ] Detect renderer/WebGL creation failure and render the route's fallback panel instead of throwing.
- [ ] Add resize handling that updates camera aspect and renderer size.
- [ ] Implement `dispose()` to remove listeners and dispose geometries, materials, renderer, and scene resources.
- [ ] Manually verify the route renders a catapult and level objects in a supported browser.

### Task 3: Add input and physics simulation

**Files:**
- Modify: `src/components/CatapultGame.astro`

**Interfaces:**
- Define `type AimState = { angle: number; power: number }` with angle in `[-0.85, 0.35]` radians and power in `[0.25, 1]`.
- Define `type ProjectileState = { active: boolean; velocity: THREE.Vector3; age: number; stationaryTime: number }`.
- Define `launch(state: AimState): void`, `resetProjectile(): void`, and `updateSimulation(deltaSeconds: number): void`.

- [ ] Convert pointer movement while dragging the catapult into clamped angle and power values; release calls `launch()` only when no projectile is active and the level is not transitioning.
- [ ] Add keyboard listeners: ArrowUp/ArrowDown adjust power, ArrowLeft/ArrowRight adjust angle, Space launches, and R resets the current level; ignore these shortcuts while typing in an input.
- [ ] Snapshot launch velocity from catapult origin using angle and power; decrement shots immediately on launch.
- [ ] Apply gravity with a clamped frame delta, update projectile position, and reset when it leaves bounds or is stationary for the timeout.
- [ ] Implement sphere-vs-target and sphere-vs-AABB block collision checks. Award target points once, decrement block hit points, and remove a block when its hits reach zero.
- [ ] Mark a level complete when all targets are hit, show the next-level action, and show retry when shots reach zero without completion.
- [ ] Keep simulation separate from rendering so it can be reasoned about independently.

### Task 4: Connect HUD, animation, and visual feedback

**Files:**
- Modify: `src/components/CatapultGame.astro`
- Modify: `src/pages/catapult.astro` only if a missing HUD hook is discovered

**Interfaces:**
- Define `renderHud(): void` to update level, shots, score, status, and action visibility.
- Define `startNextLevel(): void` and `restartLevel(): void`.

- [ ] Initialize level one and render initial HUD state.
- [ ] Add a requestAnimationFrame loop that updates simulation and renders; stop simulation/render work when `document.hidden` and resume on visibility.
- [ ] Add a trajectory hint using a small line or points derived from current aim/power, updating while aiming and hiding while a projectile is active.
- [ ] Add hit feedback with target color change, block scale/fade, and a brief camera nudge only when reduced motion is not requested.
- [ ] Wire restart and next-level buttons to state transitions and rebuild runtime entities while reusing renderer/camera where possible.
- [ ] Ensure controls have visible focus states and status updates use `aria-live="polite"`.
- [ ] Respect reduced motion by disabling camera shake and particle-like decorative motion, without disabling the launch physics.

### Task 5: Add browser smoke tests and verify

**Files:**
- Create: `tests/catapult.spec.ts`

**Interfaces:**
- Tests target `/catapult` and use the stable IDs from Task 1.

- [ ] Write a test that loads `/catapult`, checks the heading/HUD, confirms the canvas mount exists, and confirms no fallback is visible in the normal Playwright browser.
- [ ] Write a keyboard test that presses ArrowUp and Space, then asserts shots decrease and status changes from ready/aiming.
- [ ] Write a restart test that clicks restart and asserts shots return to the level's starting amount and score remains coherent.
- [ ] Run the focused Playwright test command used by the repository, fixing only game-related failures.
- [ ] Run `npm run build` and confirm `/`, `/catapult`, and existing routes compile.
- [ ] Check desktop and narrow viewport layouts manually or with Playwright screenshots, and verify reduced-motion mode does not prevent launching.

## Self-Review Checklist

- [ ] Every design requirement maps to Tasks 1–5: route, three levels, aim/launch, collisions, score, retry/next level, keyboard controls, reduced motion, WebGL fallback, resizing, teardown, and validation.
- [ ] No placeholder requirements remain; all file paths and public function names are defined.
- [ ] `LevelDefinition`, `AimState`, `ProjectileState`, `SceneRuntime`, and HUD method names are consistent across tasks.
- [ ] Existing portfolio files remain untouched unless the route shell requires a minimal link or shared-style correction.
