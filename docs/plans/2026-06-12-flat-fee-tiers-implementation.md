# Flat Fee Tiers and Clean Interactions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up chip-style design elements, remove the dashed border on the XS card, and add high-quality hover lift and glow interactions to the work page tiers.

**Architecture:** Modify the CSS and HTML template structure of `src/pages/work.astro` to use clean, high-contrast typography lists instead of border pills and chips, convert the XS tier style to a standard solid border, and implement a CSS hover transition on the `.work-tier` class.

**Tech Stack:** Astro, CSS/Vanilla Tailwind

---

### Task 1: Refactor Header and Example Chips, Normalize XS Border, and Add Hover Animations

**Files:**
- Modify: `src/pages/work.astro:65-69` (Header pills HTML)
- Modify: `src/pages/work.astro:153-157` ("Good for" example chips HTML)
- Modify: `src/pages/work.astro:339-409` (CSS style definitions for pills, XS card outline, and hover interactions)

**Step 1: Write minimal implementation changes**

Modify `src/pages/work.astro` with the following:
1. Replace the `.work-pills` list in markup with:
```html
      <ul class="work-features-list flex flex-wrap gap-y-2 gap-x-6 mt-8 md:mt-10" role="list">
        <li class="work-feature-item">Flat THB fee</li>
        <li class="work-feature-item">Scope locked at kickoff</li>
        <li class="work-feature-item">3 days – 6 weeks</li>
      </ul>
```
2. Replace the `.work-example-chip` mapping in markup with a list:
```html
                  <h3 class="font-mono text-[10px] uppercase tracking-[0.25em] text-[#6b7280] mt-8 mb-3">Good for</h3>
                  <ul class="space-y-1.5 mt-3">
                    {pkg.examples.slice(0, 4).map((ex) => (
                      <li class="work-example-item font-sans text-xs text-[#94a3b8] flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full shrink-0" style={`background-color: ${accent.label}; box-shadow: 0 0 6px ${accent.glow};`}></span>
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
```
3. Update `<style>`:
   - Remove definitions for `.work-pill`, `.work-pill--pink`, and `.work-pill--green`.
   - Remove `.work-tier--xs { border-style: dashed; }`.
   - Add `.work-features-list`, `.work-feature-item`, and `.work-feature-item::before`.
   - Add hover states and transitions to `.work-tier` and `.work-tier--featured`.

**Step 2: Commit implementation changes**

Run:
```bash
git add src/pages/work.astro
git commit -m "style: remove chip style components, standardise XS outline, and add premium hover effects"
```

---

### Task 2: Build Verification

**Files:**
- Verify build of Astro application.

**Step 1: Run build verification command**

Run: `pnpm run build`
Expected: Astro build compiles successfully with no TS/JS/Astro markup or CSS parse errors.

**Step 2: Commit any build adjustment fixes (if needed)**

If adjustments are made, add them and commit:
```bash
git commit -am "build: resolve build optimization warnings/errors"
```
