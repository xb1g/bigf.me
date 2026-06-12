# Design: CRT Boot Intro + Web Color Palette

## Goal

Replace the Netflix-style cinematic intro on bigf.me with an ownable, faster terminal boot sequence, and implement the full DESIGN.md color palette as web-usable Tailwind/CSS tokens.

## Motivation

The current `LoadingScreen.astro` uses a Netflix-style red ribbon logo. It reads as a derivative brand parody rather than something native to bigf.me. The site’s identity is a retro-futuristic terminal meets analog notebook, so the intro should feel like powering on that exact machine. At the same time, the documented color palette is only partially implemented on the web, so the intro rewrite is a good forcing function to make the palette real.

## Part 1: New Intro — CRT Power-On Sequence

### File

`src/components/LoadingScreen.astro`

### Sequence (~1.2s total)

1. **0ms** — Pure black overlay, no cursor.
2. **120ms** — CRT scanlines fade in; one quick screen flicker.
3. **200ms** — A green phosphor cursor `_` starts blinking at the top-left.
4. **350ms** — Boot lines type out with tiny random stutters:
   - `BIOS v2.0 ... OK`
   - `MOUNTING WORKSPACES ... 4 FOUND`
   - `LOADING bigf.me ...`
5. **900ms** — Final line resolves to the prompt: `> bigf.me --init`
6. **1100ms** — Overlay flickers and fades out, revealing the canvas.

### Visual Details

- **Colors:** Phosphor green (`#33ff00`) text on black, with subtle cyan/pink CRT bloom from the synth palette.
- **Typography:** JetBrains Mono for boot text; Funnel Display for the final brand reveal.
- **Effects:** Scanlines overlay, one chromatic RGB split flash, slight CRT screen warp curve.
- **Interaction:** Click/tap/Space/Esc immediately completes the fade.
- **Accessibility:** Respects `prefers-reduced-motion` — jumps straight to canvas.

### Behavior Preserved

- Show once per 24 hours via `localStorage` (`bigf-intro-seen`).
- Hide cursor during boot; restore after exit.
- Skip enabled after 300ms.
- Auto-dismiss after full animation.

## Part 2: Web Color Palette

### File

`src/styles/global.css`

### Changes

Extend the Tailwind v4 `@theme` block to include the full palette from DESIGN.md plus new intro-specific tokens:

- **Terminal:** `terminal-bg`, `terminal-text`, `terminal-prompt`, `terminal-link`, `terminal-success`, `terminal-warning`, `terminal-chip-bg`, `terminal-chip-border`, `terminal-muted`
- **Synth:** `synth-pink`, `synth-cyan`, `synth-purple`
- **Paper:** `paper-cream`, `paper-ink`, `paper-label`, `sepia-bg`, `sepia-dark`
- **Base:** `void-black` (`#08080c`), `true-black` (`#000000`)
- **Intro:** `crt-phosphor` (`#33ff00`)
- **Semantic aliases:** `register-terminal-bg`, `register-paper-bg`, `register-terminal-text`, `register-paper-text`

### Usage

Components can use Tailwind utility classes: `bg-terminal-bg`, `text-synth-pink`, `border-terminal-chip-border`, etc. The new intro will use these tokens instead of hardcoded Netflix reds.

## Part 3: Documentation

### File

`DESIGN.md`

### Changes

- Remove `netflix-red` and `netflix-red-dark` from the palette.
- Add `crt-phosphor` and `void-black`.
- Note that the palette is implemented as Tailwind/CSS tokens in `src/styles/global.css`.

## Files Changed

- `src/components/LoadingScreen.astro`
- `src/styles/global.css`
- `DESIGN.md`

## Success Criteria

- [ ] Intro no longer resembles Netflix.
- [ ] Boot sequence feels like powering on the site’s own terminal.
- [ ] Full palette is available as Tailwind utility classes.
- [ ] New intro uses palette tokens, not hardcoded colors.
- [ ] Skip + once-per-day behavior preserved.
- [ ] `prefers-reduced-motion` respected.
