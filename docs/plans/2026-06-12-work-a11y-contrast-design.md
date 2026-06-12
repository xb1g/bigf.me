# Design Document: Work Page Contrast, Semantics, and Layout Upgrades

**Date:** 2026-06-12
**Status:** Approved
**Topic:** Accessibility improvements, color contrast compliance, header semantics, and card overflow corrections.

---

## 1. Objectives
- **Fix Color Contrast:** Ensure all body text, metadata, and section labels meet WCAG AA contrast ratio of at least 4.5:1 on their background.
- **Solve Card Overflow Clipping:** Prevent clipping of outer glows/shadows on card hover transitions, while preserving correct edge-clipping of the rotated badge ribbons.
- **Enhance Typography & Readability:** Increase trigger description text from 11px to 12px, wrap long blockquotes to prevent long character lines, and convert footer text from uppercase to regular casing.
- **Improve Heading Structure:** Refactor visual hierarchy to use semantic headings (`h1` followed by `h2` and `h3`), avoiding screen reader heading level skipping.

---

## 2. Proposed Changes

### 2.1 Card Overflow Refactoring
- **File:** `src/pages/work.astro`
- **Markup changes:**
  - Wrap the inner content of `<article class="work-tier ...">` in a `<div class="work-tier-clip">` block. Move the badge ribbon and `work-tier-inner` inside it.
- **CSS changes:**
  - Remove `overflow: hidden;` from `.work-tier`.
  - Add class:
    ```css
    .work-tier-clip {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: inherit;
    }
    ```

### 2.2 Heading Hierarchy
- **File:** `src/pages/work.astro`
- **Changes:**
  - Change `.work-tier-id` from `span` to `h2` element.
  - Update Phase 2 section title to `h2` with `text-xs` (12px) and `#94a3b8` color.

### 2.3 Contrast Adjustments
- **File:** `src/pages/work.astro`
- **Changes:**
  - Replace `#6b7280` and `#64748b` with `#94a3b8` (Slate 400) or `#cbd5e1` (Slate 300) for labels, tags, details, and description copy.

### 2.4 Typography & Casing
- **File:** `src/pages/work.astro`
- **Changes:**
  - Trigger descriptions: `text-[11px]` -> `text-xs`.
  - Reference summary text: add class `max-w-[70ch]`.
  - Footer tag: change class to `text-[#cbd5e1] font-mono text-xs tracking-wider normal-case relative z-10`.
