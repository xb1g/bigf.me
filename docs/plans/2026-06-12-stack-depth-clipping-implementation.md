# Stack Depth & Clipping Refinements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand technical stack details to showcase Cloudflare and Backblaze B2 best practices + benefits, and resolve overflow container clipping warnings on cards and loading screens.

**Architecture:** Update `sharedStack` in `src/lib/work_plans.ts` with detailed architectural bullets, replace `overflow: hidden` on `.work-tier-clip` in `src/pages/work.astro` with `clip-path: inset(0 round 1.35rem)`, and remove `overflow: hidden` from `.intro-overlay` in `src/components/LoadingScreen.astro`.

**Tech Stack:** Astro, TypeScript, CSS

---

### Task 1: Update Stack Data, Refactor Card Clipping to clip-path, and Remove Intro Overflow

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

**Step 2: Commit implementation changes**

Run:
```bash
git add src/lib/work_plans.ts src/pages/work.astro src/components/LoadingScreen.astro
git commit -m "style: expand tech stack details and resolve final clipping warnings using clip-path"
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
git commit -am "build: resolve build optimization warnings/errors after stack upgrades"
```
