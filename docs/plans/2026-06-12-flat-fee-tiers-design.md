# Design Document: Work Page Design Polish & Interaction Upgrades

**Date:** 2026-06-12
**Status:** Approved
**Topic:** Clean layout transitions, border updates, and premium hover animations for `/work` packages.

---

## 1. Objectives
- **Remove Chip-Style Aesthetics:** Replace rounded, bordered header pills and example chips with clean, high-contrast, text-based layouts.
- **Normalize Card Outlines:** Eliminate the dashed outline (`border-style: dashed`) on the XS tier card, ensuring standard solid hairline borders across all packages.
- **Add Premium Hover Interactions:** Implement responsive lift transitions, glowing border intensifications, and enhanced shadow blur on card hover events.

---

## 2. Proposed Changes

### 2.1 Header Benefits List
Instead of styled pills with borders, the top-level benefits ("Flat THB fee", etc.) will be presented as an inline-flex text-only list, separated by small glowing cyan bullets.

- **File:** `src/pages/work.astro`
- **Markup changes:**
  ```html
  <ul class="work-features-list flex flex-wrap gap-y-2 gap-x-6 mt-8 md:mt-10" role="list">
    <li class="work-feature-item">Flat THB fee</li>
    <li class="work-feature-item">Scope locked at kickoff</li>
    <li class="work-feature-item">3 days – 6 weeks</li>
  </ul>
  ```
- **CSS styles:**
  ```css
  .work-features-list {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .work-feature-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .work-feature-item::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #5cceff;
    box-shadow: 0 0 8px #5cceff;
  }
  ```

### 2.2 Examples ("Good for") inside Cards
Replace the `work-example-chip` elements with a clean vertical list of text with color-coded dot markers.

- **File:** `src/pages/work.astro`
- **Markup changes:**
  ```html
  <ul class="space-y-1.5 mt-3">
    {pkg.examples.slice(0, 4).map((ex) => (
      <li class="work-example-item font-sans text-xs text-[#94a3b8] flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full shrink-0" style={`background-color: ${accent.label}; box-shadow: 0 0 6px ${accent.glow};`}></span>
        <span>{ex}</span>
      </li>
    ))}
  </ul>
  ```

### 2.3 XS Tier Outline
Ensure consistency by converting the XS tier card from dashed to solid border.

- **File:** `src/pages/work.astro`
- **Style changes:**
  - Remove `.work-tier--xs { border-style: dashed; }`

### 2.4 Hover Interactions
Apply smooth 3D translate and glowing box-shadow scaling when the user hovers over any card.

- **File:** `src/pages/work.astro`
- **Style changes:**
  ```css
  .work-tier {
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s ease, box-shadow 0.4s ease;
  }
  .work-tier:hover {
    transform: translateY(-6px);
    border-color: var(--tier-label);
    box-shadow:
      0 0 0 1px var(--tier-border) inset,
      0 32px 64px -16px var(--tier-glow),
      0 0 40px -10px var(--tier-glow);
  }
  .work-tier--featured {
    box-shadow:
      0 0 0 1px rgba(255, 107, 157, 0.15) inset,
      0 32px 64px -20px rgba(255, 107, 157, 0.2),
      0 0 80px -20px rgba(255, 107, 157, 0.15);
  }
  .work-tier--featured:hover {
    box-shadow:
      0 0 0 1px rgba(255, 107, 157, 0.3) inset,
      0 32px 64px -12px rgba(255, 107, 157, 0.35),
      0 0 90px -10px rgba(255, 107, 157, 0.25);
  }
  ```
