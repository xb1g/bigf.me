# Work Page Accessibility, Contrast, and Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve all reported visual quality issues on the `/work` page, including WCAG AA color contrast, skipped heading levels, small font sizes, too-long lines, and card hover clipping.

**Architecture:** Wrap package content inside an inner `.work-tier-clip` container with `overflow: hidden`, remove `overflow: hidden` from `.work-tier` to let glows expand, update typography tags (e.g. `span` -> `h2`), and systematically replace `#6b7280` / `#64748b` with brighter slate gray colors.

**Tech Stack:** Astro, CSS/Tailwind

---

### Task 1: Refactor Structure, Semantics, and Styling in `src/pages/work.astro`

**Files:**
- Modify: `src/pages/work.astro`

**Step 1: Write minimal implementation changes**

Modify `src/pages/work.astro` as follows:

1. **Card Overflow & Ribbon Clipping:**
   - In `<main>`, wrap the content of `article` in a `<div class="work-tier-clip">` wrapper:
     ```html
     <article
       id={`tier-${pkg.id}`}
       class:list={[
         'work-tier scroll-mt-28 rounded-[1.35rem] border backdrop-blur-md transition-all duration-500',
         isFeatured ? 'work-tier--featured' : 'work-tier--standard',
       ]}
       style={`--tier-border: ${accent.border}; --tier-glow: ${accent.glow}; --tier-label: ${accent.label}`}
     >
       <div class="work-tier-clip">
         {pkg.badge && (
           <div
             class:list={[
               'work-tier-ribbon font-mono',
               isXs && 'work-tier-ribbon--green',
             ]}
           >
             {pkg.badge}
           </div>
         )}

         <div class="work-tier-inner grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] gap-8 lg:gap-10 p-6 md:p-8 lg:p-9">
           ...
         </div>
       </div>
     </article>
     ```
   - In the `<style>` section, remove `overflow: hidden;` from `.work-tier`.
   - Add `.work-tier-clip` styles:
     ```css
     .work-tier-clip {
       position: relative;
       width: 100%;
       height: 100%;
       overflow: hidden;
       border-radius: inherit;
     }
     ```

2. **Heading Semantics:**
   - Change the class `.work-tier-id` markup tag from `span` to `h2` (around line 103).
   - In the Phase 2 section, change `h2` markup to use `text-xs` (instead of `text-[10px]`) and `text-[#94a3b8]` (instead of `text-[#6b7280]`).

3. **Contrast Adjustments:**
   - Update all occurrences of `text-[#6b7280]` and `text-[#64748b]` to `text-[#94a3b8]` or `text-[#cbd5e1]`.
   - Specifically:
     - Header benefits section (line 53): change `text-[#6b7280]` to `text-[#94a3b8]`.
     - Timeline labels (line 106 & 117): change `text-[#6b7280]` / `text-[#64748b]` to `text-[#cbd5e1]` / `text-[#94a3b8]`.
     - Milestone row elements: change milestone triggers (line 135) to `text-[#cbd5e1]` (replacing `text-[#64748b]`).
     - "In scope", "Good for", and "Not included" section titles: change `text-[#6b7280]` to `text-[#cbd5e1]`.
     - "Not included" items (line 166): change `text-[#64748b]` to `text-[#cbd5e1]`.
     - Bento stack notes: change `text-[#64748b]` to `text-[#94a3b8]`.
     - Phase 2 description labels and bullet items: change to `#cbd5e1`.
     - Reference subtitle header (line 236): change `text-[#6b7280]` to `text-[#94a3b8]`.
     - Footer copy: change `text-[#6b7280]` to `text-[#cbd5e1]`.

4. **Typography Size, Casing, and Line Length:**
   - Milestone trigger description: change `text-[11px]` to `text-xs`.
   - Reference summary paragraph (line 239): add class `max-w-[70ch]` to the paragraph.
   - Footer copy: change class from `text-[#6b7280] font-mono text-[10px] uppercase tracking-[0.2em]` to `text-[#cbd5e1] font-mono text-xs tracking-wider normal-case`.

**Step 2: Commit implementation changes**

Run:
```bash
git add src/pages/work.astro
git commit -m "style: fix visual contrast, heading semantics, card overflow clipping, and text legibility on work page"
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
git commit -am "build: resolve build optimization warnings/errors after quality upgrades"
```
