# Stack Depth, Clipping Refinements & Enterprise AI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand technical stack details to showcase Cloudflare and Backblaze B2 best practices, resolve overflow container clipping warnings on cards and loading screens, and add a professional SME/Enterprise AI Adoption Consultation section.

**Architecture:** Update `sharedStack` in `src/lib/work_plans.ts` with detailed architectural bullets, replace `overflow: hidden` on `.work-tier-clip` in `src/pages/work.astro` with `clip-path: inset(0 round 1.35rem)`, remove `overflow: hidden` from `.intro-overlay` in `src/components/LoadingScreen.astro`, and append a new, professionally styled Enterprise AI Adoption callout section on the `/work` page.

**Tech Stack:** Astro, TypeScript, CSS

---

### Task 1: Update Stack Data, Refactor Card Clipping to clip-path, Remove Intro Overflow, and Add Enterprise AI Section

**Files:**
- Modify: `src/lib/work_plans.ts`
- Modify: `src/pages/work.astro`
- Modify: `src/components/LoadingScreen.astro`

**Step 1: Write minimal implementation changes**

1. In `src/lib/work_plans.ts`, update `sharedStack` to:
```typescript
export const sharedStack = [
  'Modern frameworks: Astro, Next.js, or React + PostgreSQL / Supabase for rich state and robust data management.',
  'Global Edge Delivery: Cloudflare CDN integration for smart edge caching, DDoS protection, and sub-50ms TTFB.',
  'Zero-Egress Storage: Backblaze B2 S3-compatible object storage paired with Cloudflare Bandwidth Alliance for cost-free media delivery.',
  'Asset Optimization Pipeline: Next-gen responsive image compression (WebP/AVIF) and edge-cached asset routing.',
  'Continuous Deployment: Automated Git-triggered builds (Vercel, Railway, or Cloudflare Pages) with instant preview deployments.',
];
```

2. In `src/pages/work.astro`, modify the `.work-tier-clip` styles inside `<style>` block:
```css
  .work-tier-clip {
    position: relative;
    width: 100%;
    height: 100%;
    clip-path: inset(0 round 1.35rem);
  }
```
Ensure `overflow: hidden;` is removed from `.work-tier-clip` styles (or replaced entirely by the block above).

3. In `src/components/LoadingScreen.astro`, locate `.intro-overlay` in `<style>` (around line 30) and remove `overflow: hidden;`.

4. In `src/pages/work.astro`, insert the following HTML structure just before the `work-reference` section:
```html
      <!-- Enterprise AI Advisory -->
      <section class="work-enterprise rounded-[1.35rem] border border-[#ff6b9d]/30 bg-[#0f0a14]/60 p-6 md:p-8 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 bg-[#ff6b9d]/5 rounded-full blur-3xl pointer-events-none"></div>
        <div class="max-w-3xl relative z-10">
          <p class="font-mono text-xs uppercase tracking-[0.25em] text-[#ff6b9d] mb-3">Enterprise advisory</p>
          <h2 class="font-display text-2xl md:text-3xl text-[#f1f5f9] mb-4 tracking-tight">SME & Enterprise AI Adoption</h2>
          <p class="font-sans text-sm md:text-base text-[#cbd5e1] leading-relaxed mb-6">
            Advising leadership on practical AI integration, model selection, custom LLM fine-tuning, and workflow automation. From feasibility workshops to secure enterprise deployment pipelines on Cloudflare and Backblaze.
          </p>
          <div class="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-[#cbd5e1]">
            <span class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-[#ff6b9d] shadow-[0_0_8px_#ff6b9d]"></span>
              Custom LLM Feasibility
            </span>
            <span class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-[#ff6b9d] shadow-[0_0_8px_#ff6b9d]"></span>
              Security & Privacy Audits
            </span>
            <span class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-[#ff6b9d] shadow-[0_0_8px_#ff6b9d]"></span>
              Workflow Automation
            </span>
          </div>
        </div>
      </section>
```

**Step 2: Commit implementation changes**

Run:
```bash
git add src/lib/work_plans.ts src/pages/work.astro src/components/LoadingScreen.astro
git commit -m "style: expand stack details, add Enterprise AI advisory, and resolve clipping bugs"
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
git commit -am "build: resolve build optimization warnings/errors after stack and enterprise upgrades"
```
