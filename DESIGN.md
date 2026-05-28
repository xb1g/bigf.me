---
name: bigf.me
description: Bunyasit Fang's personal identity surface — a retro-futuristic terminal meets analog notebook.
colors:
  terminal-bg: "#0a0a0f"
  terminal-text: "#e2e8f0"
  terminal-prompt: "#ff5789"
  terminal-link: "#00d4ff"
  terminal-success: "#42ff9e"
  terminal-warning: "#ffd700"
  terminal-chip-bg: "#15151f"
  terminal-chip-border: "#2a2a3f"
  terminal-muted: "#6b7280"
  synth-pink: "#ff6b9d"
  synth-cyan: "#5cceff"
  synth-purple: "#f033b4"
  paper-cream: "#fdfcf8"
  paper-ink: "#3a3a3a"
  paper-label: "#8c8577"
  sepia-bg: "#f5efe6"
  sepia-dark: "#2a1608"
  netflix-red: "#e50914"
  netflix-red-dark: "#b20710"
typography:
  display:
    fontFamily: "'Funnel Display', 'Bebas Neue', Impact, 'Arial Black', sans-serif"
    fontSize: "clamp(2rem, 6vw, 4rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.15em"
  headline:
    fontFamily: "'Funnel Display', 'Bebas Neue', Impact, sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.05em"
  title:
    fontFamily: "'Funnel Sans', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'Funnel Sans', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.1em"
    textTransform: "uppercase"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  thai:
    fontFamily: "'Bai Jamjuree', 'Funnel Sans', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "2px"
  md: "1rem"
  lg: "1.5rem"
  xl: "3rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.terminal-chip-bg}"
    textColor: "{colors.synth-pink}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    border: "1px solid {colors.terminal-chip-border}"
  button-primary-hover:
    backgroundColor: "{colors.synth-pink}"
    textColor: "{colors.terminal-bg}"
    boxShadow: "0 0 20px rgba(255,107,157,0.4)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.terminal-muted}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    border: "1px solid rgba(255,255,255,0.1)"
  button-ghost-hover:
    textColor: "{colors.terminal-text}"
    borderColor: "rgba(255,255,255,0.3)"
  card-terminal:
    backgroundColor: "{colors.terminal-bg}"
    rounded: "{rounded.xl}"
    padding: "0"
    border: "24px solid #1a1a24"
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)"
  card-paper:
    backgroundColor: "{colors.paper-cream}"
    rounded: "{rounded.md}"
    padding: "24px"
    border: "none"
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)"
  input-terminal:
    backgroundColor: "transparent"
    textColor: "{colors.terminal-text}"
    rounded: "0"
    padding: "4px 0"
    border: "none"
    borderBottom: "1px solid {colors.terminal-chip-border}"
  nav-bar:
    backgroundColor: "rgba(253,252,248,0.9)"
    textColor: "{colors.paper-label}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
    backdropFilter: "blur(12px)"
---

# Design System: bigf.me

## 1. Overview

**Creative North Star: "The Analog-Digital Workshop"**

bigf.me is not a standard portfolio. It is a personal workspace rendered as a website: a terminal for engineering, a notebook for thoughts, a gallery for memories. The design system carries two distinct but connected visual registers. The terminal workspace lives in dark synthwave space — CRT glow, neon accents, deep shadows. The notebook and gallery workspaces live in warm analog paper — cream surfaces, ink typography, flat minimalism. Both are authentic to the same person: a builder who thinks in code and reflects on paper.

The system rejects generic SaaS aesthetics, template-driven layouts, and glassmorphism-by-default. Every effect serves atmosphere: scanlines evoke nostalgia, the custom cursor signals craft, the infinite canvas invites exploration. This is a portfolio that demonstrates technical capability by being the interface itself.

**Key Characteristics:**
- Dual-register palette: dark terminal vs. warm paper
- Structural shadows for depth, flat surfaces for content
- Typography as hierarchy: display for drama, mono for technical, sans for reading
- Motion as feedback: hover glows, smooth panning, choreographed intro
- Nostalgia with intent: every retro effect has a purpose

## 2. Colors

The palette is split into two registers that share the same page. Terminal colors carry the dark synthwave identity. Paper colors carry the analog warmth.

### Primary
- **Neon Synth Pink** (`#ff6b9d`): The primary accent. Used for CTAs, hover states, the custom cursor, and energetic highlights. Appears on ≤15% of any dark surface.
- **Electric Cyan** (`#00d4ff`): Secondary accent for links, active states, and terminal prompt. Pairs with pink for a classic vaporwave signal.

### Secondary
- **Vapor Purple** (`#f033b4`): Tertiary accent for special highlights and gradient endpoints. Used sparingly — typically in glows and background gradients, never as a text color.
- **Terminal Green** (`#42ff9e`): Success and confirmation states. Used in terminal output and positive feedback.

### Neutral
- **Void Black** (`#0a0a0f`): The terminal background. The deepest surface, used for the canvas and terminal workspace.
- **Ghost White** (`#e2e8f0`): Primary text on dark surfaces. High contrast without being pure white.
- **Muted Gray** (`#6b7280`): Secondary text, labels, disabled states.
- **Chip Surface** (`#15151f`): Elevated dark surface for buttons, inputs, and cards within the terminal.
- **Chip Border** (`#2a2a3f`): Subtle borders and dividers in the terminal workspace.
- **Paper Cream** (`#fdfcf8`): The notebook/gallery background. Warm, inviting, distinct from the terminal void.
- **Paper Ink** (`#3a3a3a`): Primary text on paper surfaces.
- **Paper Label** (`#8c8577`): Secondary text on paper — timestamps, captions, metadata.
- **Sepia Base** (`#f5efe6`): Gallery-specific warm background for the vintage photo album aesthetic.
- **Sepia Dark** (`#2a1608`): Deep brown for gallery headings and borders.

### Named Rules
**The Register-Switch Rule.** When moving from terminal to paper workspaces, the palette switches completely. Never mix terminal neon on paper surfaces or paper cream on terminal surfaces. The navigation bar bridges both with a translucent cream treatment.

**The Neon Rarity Rule.** The primary pink accent appears on ≤15% of any given dark screen. Its scarcity is the point — when it appears, it signals action.

## 3. Typography

**Display Font:** Funnel Display (with Bebas Neue, Impact fallback)
**Body Font:** Funnel Sans (with system-ui fallback)
**Mono Font:** JetBrains Mono (ui-monospace fallback)
**Thai Font:** Bai Jamjuree (with Funnel Sans fallback)

**Character:** Funnel Display brings geometric confidence to headlines and the intro sequence. Funnel Sans provides clean, modern readability for body text across both registers. JetBrains Mono carries the technical voice of the terminal. The pairing creates a system that feels both engineered and designed.

### Hierarchy
- **Display** (700, clamp(2rem, 6vw, 4rem), line-height 1, letter-spacing 0.15em): Hero moments, the Netflix-style intro brand text, section anchors. All caps or lowercase, never mixed.
- **Headline** (600, clamp(1.5rem, 4vw, 2.5rem), line-height 1.1): Workspace titles, section headers.
- **Title** (600, 1.25rem, line-height 1.3): Card titles, subsections.
- **Body** (400, 1rem, line-height 1.6): Reading text, captions, descriptions. Max line length 65–75ch.
- **Label** (500, 0.75rem, line-height 1.4, letter-spacing 0.1em, uppercase): Navigation, timestamps, metadata, terminal quick commands.
- **Mono** (400, 0.875rem, line-height 1.5): Terminal output, code, technical readouts.
- **Thai** (400, 1rem, line-height 1.6): Thai language content, fallback to Funnel Sans for Latin script in mixed content.

### Named Rules
**The One Voice Per Surface Rule.** Terminal workspace uses mono for everything technical. Paper workspace uses sans for everything human. Never mix mono body text with paper backgrounds.

## 4. Elevation

The system uses shadows structurally in the terminal workspace and stays flat in the paper workspace. This reinforces the dual-register identity: digital depth vs. analog flatness.

### Shadow Vocabulary
- **Terminal Depth** (`0 30px 80px rgba(0,0,0,0.6)`): The primary shadow for canvas items (terminal, notebook, gallery containers). Creates the sense of floating monitors on a dark desk.
- **CRT Inner Shadow** (`inset 0 0 100px rgba(0,0,0,0.95)`): Inside the terminal monitor bezel. Simulates the curvature and depth of a CRT screen.
- **Button Glow** (`0 0 20px rgba(255,107,157,0.4)`): Hover state for primary actions. Pink bloom that signals interactivity.
- **Paper Shadow** (`0 4px 20px rgba(0,0,0,0.1)`): Minimal, diffuse shadow for paper cards. Barely there — just enough to lift off the background.
- **Nav Backdrop** (`0 5px 15px rgba(0,0,0,0.05)`): Navigation bar floating above content with a light touch.

### Named Rules
**The Depth-By-Register Rule.** Terminal elements may cast deep shadows. Paper elements stay flat or use minimal diffuse shadows. The elevation system itself signals which workspace you're in.

## 5. Components

### Buttons
- **Shape:** Fully rounded (9999px) for all variants. Pill shape is the default.
- **Primary:** Chip surface background (`#15151f`), synth pink text, 1px chip border. Padding 8px 16px. Mono or sans label typography.
- **Hover / Focus:** Background shifts to synth pink, text inverts to void black. Pink glow shadow appears. Transition 0.3s ease.
- **Ghost:** Transparent background, muted gray text, 1px white/10% border. For secondary actions.
- **Ghost Hover:** Text brightens to white, border becomes white/30%.

### Chips / Tags
- **Style:** Pill shape, chip background, chip border. Small uppercase label text.
- **Quick Command Variant:** Smaller (text-xs), colored border matching accent hue (pink, cyan, purple), colored text at 80% opacity.

### Cards / Containers
- **Terminal Card:** 3rem rounded corners, 24px dark bezel border, deep terminal shadow. Black background. Used for the main terminal window.
- **Paper Card:** 1rem rounded corners, paper cream background, minimal diffuse shadow. Used for notebook pages and gallery frames.
- **Internal Padding:** 16px–24px depending on content density.

### Inputs / Fields
- **Terminal Input:** Transparent background, no border except bottom 1px chip-border. Ghost white text. JetBrains Mono. No radius.
- **Focus:** Bottom border shifts to cyan. Caret is cyan.
- **No visible label:** Placeholder or context text replaces traditional labels.

### Navigation
- **Style:** Fixed bottom or top bar. Cream background at 90% opacity with backdrop blur. Pill-shaped container.
- **Typography:** Small sans label, muted gray default, dark ink on hover.
- **Icons:** 18px stroke-based SVGs, 2px stroke weight.
- **Mobile:** Full-width quick command bar with scrollable pill buttons.

### CRT Monitor (Signature Component)
- **Bezel:** 24px dark border (#1a1a24) with rounded corners (3rem outer, 1.5rem inner).
- **Screen:** Grid background, scanlines overlay, moving scanline animation, tracking band.
- **Glass:** Inner shadow simulating CRT curvature.
- **Construction Tape:** Black bar with yellow warning text at top of terminal.

## 6. Do's and Don'ts

### Do:
- **Do** use the full dual-register palette: terminal for engineering, paper for reflection.
- **Do** keep neon accents rare — ≤15% of any dark surface.
- **Do** use structural shadows in the terminal and flat/minimal shadows in paper.
- **Do** maintain the 3rem rounded corners for main canvas items — this is a signature shape.
- **Do** respect `prefers-reduced-motion` for all CRT effects and animations.
- **Do** use Funnel Display for dramatic moments (intro, headlines) and Funnel Sans for reading.
- **Do** keep line lengths at 65–75ch for body text.

### Don't:
- **Don't** mix terminal neon colors on paper backgrounds.
- **Don't** use glassmorphism as a default — blur only when it serves depth, not decoration.
- **Don't** create identical card grids with icon + heading + text repeated endlessly.
- **Don't** use gradient text (`background-clip: text`) — use solid color emphasis via weight or size.
- **Don't** use side-stripe borders greater than 1px as colored accents.
- **Don't** use the hero-metric template (big number, small label, gradient accent).
- **Don't** suppress the custom cursor on non-interactive elements — it is part of the brand.
- **Don't** use em dashes — use commas, colons, or periods.
