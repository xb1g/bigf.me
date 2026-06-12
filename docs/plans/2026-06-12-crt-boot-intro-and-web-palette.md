# CRT Boot Intro + Web Palette Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Netflix-style intro with a faster CRT terminal boot sequence and implement the full bigf.me color palette as Tailwind v4 web tokens.

**Architecture:** Extend `src/styles/global.css` with the complete palette as CSS custom properties under `@theme`, then rewrite `src/components/LoadingScreen.astro` to use those tokens for a phosphor-green terminal boot animation. Update `DESIGN.md` to reflect the new palette. Test by running the dev server and inspecting the intro.

**Tech Stack:** Astro, Tailwind CSS v4 (`@theme` / `@import "tailwindcss"`), vanilla CSS/JS, pnpm.

---

### Task 1: Extend the web color palette in global.css

**Files:**
- Modify: `src/styles/global.css:3-20`

**Step 1: Inspect current palette**

Read `src/styles/global.css` lines 1-20 to confirm existing `@theme` block.

**Step 2: Add missing palette tokens**

Replace the existing `@theme` block with the full palette. Keep existing tokens unchanged so inline classes don't break.

```css
@theme {
  /* Terminal */
  --color-terminal-bg: #0a0a0f;
  --color-terminal-text: #e2e8f0;
  --color-terminal-prompt: #ff5789;
  --color-terminal-link: #00d4ff;
  --color-terminal-success: #42ff9e;
  --color-terminal-warning: #ffd700;
  --color-terminal-chip-bg: #15151f;
  --color-terminal-chip-border: #2a2a3f;
  --color-terminal-muted: #6b7280;

  /* Synth */
  --color-synth-pink: #ff6b9d;
  --color-synth-cyan: #5cceff;
  --color-synth-purple: #f033b4;

  /* Paper / Analog */
  --color-paper-cream: #fdfcf8;
  --color-paper-ink: #3a3a3a;
  --color-paper-label: #8c8577;
  --color-sepia-bg: #f5efe6;
  --color-sepia-dark: #2a1608;

  /* Base */
  --color-void-black: #08080c;
  --color-true-black: #000000;

  /* Intro */
  --color-crt-phosphor: #33ff00;

  /* Semantic aliases */
  --color-register-terminal-bg: #0a0a0f;
  --color-register-terminal-text: #e2e8f0;
  --color-register-paper-bg: #fdfcf8;
  --color-register-paper-text: #3a3a3a;

  /* Typography */
  --font-display: 'Funnel Display', 'Bebas Neue', Impact, 'Arial Black', sans-serif;
  --font-sans: 'Funnel Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-thai: 'Bai Jamjuree', 'Funnel Sans', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
```

**Step 3: Verify Tailwind picks up the new tokens**

Run: `pnpm dev`
Expected: dev server starts without CSS errors.

**Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: implement full web color palette as Tailwind tokens"
```

---

### Task 2: Update DESIGN.md palette

**Files:**
- Modify: `DESIGN.md:22-23` and surrounding color section

**Step 1: Remove Netflix colors**

Delete:
- `netflix-red: "#e50914"`
- `netflix-red-dark: "#b20710"`

**Step 2: Add new tokens**

Add under `colors:`:
- `void-black: "#08080c"`
- `true-black: "#000000"`
- `crt-phosphor: "#33ff00"`

**Step 3: Add implementation note**

Append to the colors intro paragraph:

> "The palette is implemented as Tailwind v4 CSS custom properties in `src/styles/global.css` and consumed via utility classes like `bg-terminal-bg` and `text-synth-pink`."

**Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs: update DESIGN.md palette, remove Netflix colors"
```

---

### Task 3: Rewrite LoadingScreen.astro as CRT boot sequence

**Files:**
- Modify: `src/components/LoadingScreen.astro`

**Step 1: Replace component markup and styles**

Replace the entire file with a CRT boot overlay:

```astro
---
// CRT terminal boot intro for bigf.me
// Pure CSS/JS animation - no external assets
---

<div id="intro-overlay" class="intro-overlay" aria-hidden="true">
  <div class="crt-screen">
    <div class="scanlines"></div>
    <div class="boot-content">
      <div class="boot-lines" id="boot-lines"></div>
      <div class="prompt-line" id="prompt-line">
        <span class="prompt-symbol">&gt;</span>
        <span class="prompt-text">bigf.me --init</span>
        <span class="cursor" id="cursor">_</span>
      </div>
    </div>
  </div>

  <div class="skip-hint">
    <span class="skip-text">Click or tap to skip</span>
  </div>
</div>

<style>
  .intro-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: var(--color-true-black);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    opacity: 1;
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.6s;
  }

  .intro-overlay.intro--done {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .intro-overlay.intro--hidden {
    display: none;
  }

  .crt-screen {
    position: relative;
    width: 100%;
    height: 100%;
    max-width: 900px;
    padding: clamp(1.5rem, 5vw, 4rem);
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    font-family: var(--font-mono);
    color: var(--color-crt-phosphor);
    text-shadow: 0 0 4px rgba(51, 255, 0, 0.6), 0 0 12px rgba(51, 255, 0, 0.3);
  }

  .crt-screen::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.6) 100%);
    pointer-events: none;
    z-index: 2;
  }

  .scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(0, 0, 0, 0.25) 3px,
      rgba(0, 0, 0, 0.25) 6px
    );
    opacity: 0;
    animation: scanlinesIn 0.2s ease 0.12s forwards;
    pointer-events: none;
    z-index: 3;
  }

  .boot-content {
    position: relative;
    z-index: 1;
    font-size: clamp(0.75rem, 1.5vw, 0.95rem);
    line-height: 1.8;
    letter-spacing: 0.04em;
    opacity: 0;
    animation: contentIn 0.15s ease 0.2s forwards;
  }

  .boot-lines {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 6rem;
  }

  .boot-line {
    white-space: nowrap;
    overflow: hidden;
    width: 0;
    animation: typeLine 0.18s steps(24, end) forwards;
  }

  .prompt-line {
    margin-top: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0;
    animation: promptIn 0.2s ease 0.85s forwards;
  }

  .prompt-symbol {
    color: var(--color-terminal-link);
    text-shadow: 0 0 4px rgba(0, 212, 255, 0.5);
  }

  .prompt-text {
    color: var(--color-crt-phosphor);
  }

  .cursor {
    display: inline-block;
    width: 0.6em;
    animation: blink 0.8s step-end infinite;
  }

  .skip-hint {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    opacity: 0;
    animation: skipHintIn 0.3s ease 0.4s forwards;
    cursor: pointer;
    z-index: 10001;
  }

  .skip-text {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.25);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: color 0.3s ease;
  }

  .skip-hint:hover .skip-text {
    color: rgba(255, 255, 255, 0.5);
  }

  @keyframes scanlinesIn {
    from { opacity: 0; }
    to { opacity: 0.45; }
  }

  @keyframes contentIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes typeLine {
    from { width: 0; }
    to { width: 100%; }
  }

  @keyframes promptIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes skipHintIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .intro-overlay.intro--exiting {
    animation: introExit 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes introExit {
    0% { opacity: 1; filter: brightness(1); }
    20% { filter: brightness(1.4) contrast(1.2); }
    100% { opacity: 0; visibility: hidden; filter: brightness(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .intro-overlay {
      display: none !important;
    }
  }
</style>

<script>
  (function() {
    const STORAGE_KEY = 'bigf-intro-seen';
    const OVERLAY_ID = 'intro-overlay';
    const SKIP_DELAY = 300;
    const AUTO_SKIP_DELAY = 1200;

    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const lastSeen = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (lastSeen && (now - parseInt(lastSeen)) < ONE_DAY) {
      overlay.classList.add('intro--hidden');
      return;
    }

    const cursorDot = document.getElementById('cursor-dot');
    const cursorOutline = document.getElementById('cursor-outline');
    if (cursorDot) cursorDot.style.opacity = '0';
    if (cursorOutline) cursorOutline.style.opacity = '0';

    const bootLines = document.getElementById('boot-lines');
    const lines = [
      'BIOS v2.0 ............................ OK',
      'MOUNTING WORKSPACES .................. 4 FOUND',
      'LOADING bigf.me ...................... READY'
    ];

    if (bootLines) {
      lines.forEach((text, i) => {
        const line = document.createElement('div');
        line.className = 'boot-line';
        line.textContent = text;
        line.style.animationDelay = `${0.35 + i * 0.18}s`;
        bootLines.appendChild(line);
      });
    }

    let skipEnabled = false;
    let exited = false;

    function exitIntro() {
      if (exited) return;
      exited = true;
      localStorage.setItem(STORAGE_KEY, now.toString());
      overlay.classList.add('intro--exiting');

      setTimeout(() => {
        if (cursorDot) cursorDot.style.opacity = '1';
        if (cursorOutline) cursorOutline.style.opacity = '1';
      }, 300);

      setTimeout(() => {
        overlay.classList.add('intro--hidden');
      }, 600);
    }

    setTimeout(() => { skipEnabled = true; }, SKIP_DELAY);
    const autoExitTimer = setTimeout(() => { exitIntro(); }, AUTO_SKIP_DELAY);

    overlay.addEventListener('click', () => {
      if (!skipEnabled || exited) return;
      clearTimeout(autoExitTimer);
      exitIntro();
    });

    overlay.addEventListener('touchstart', () => {
      if (!skipEnabled || exited) return;
      clearTimeout(autoExitTimer);
      exitIntro();
    }, { passive: true });

    overlay.addEventListener('keydown', (e) => {
      if (!skipEnabled || exited) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        clearTimeout(autoExitTimer);
        exitIntro();
      }
    });

    overlay.setAttribute('tabindex', '-1');
    overlay.focus();
  })();
</script>
```

**Step 2: Verify dev server still builds**

Run: `pnpm dev`
Expected: No Astro/CSS errors, intro renders.

**Step 3: Manual test checklist**

- Clear `localStorage` key `bigf-intro-seen` and refresh.
- Observe boot lines type out and prompt appears.
- Click overlay — intro fades early.
- Refresh again within 24h — intro is skipped.
- Toggle `prefers-reduced-motion` in dev tools — intro is hidden.

**Step 4: Commit**

```bash
git add src/components/LoadingScreen.astro
git commit -m "feat: replace Netflix intro with CRT terminal boot sequence"
```

---

### Task 4: Smoke test the site

**Files:**
- No file changes.

**Step 1: Start dev server**

Run: `pnpm dev`
Expected: Server starts at `http://localhost:4321`.

**Step 2: Open in browser and clear storage**

Open `http://localhost:4321`, open DevTools → Application → Local Storage, delete `bigf-intro-seen`, refresh.

**Step 3: Verify the boot sequence**

Expected:
- Black screen → scanlines → green text types → prompt `> bigf.me --init` → fade to canvas.
- No Netflix red anywhere.
- Custom cursor reappears after fade.

**Step 4: Verify palette usage**

Use DevTools inspector on the overlay background. Expected: `background: var(--color-true-black)` or computed `#000000`.

**Step 5: Commit (only if fixes are needed)**

If any visual fixes are required, apply and commit with a descriptive message. Otherwise no commit needed.

---

## Done When

- [ ] `src/styles/global.css` contains the full palette as Tailwind v4 tokens.
- [ ] `DESIGN.md` no longer references Netflix colors and documents the new tokens.
- [ ] `src/components/LoadingScreen.astro` renders a CRT boot sequence using palette tokens.
- [ ] Intro is skippable, debounced to once per 24h, and respects `prefers-reduced-motion`.
- [ ] Dev server starts and intro displays correctly in browser.
