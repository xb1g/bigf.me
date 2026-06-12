# Design Document: Stack Depth & Clipping Refinements

**Date:** 2026-06-12
**Status:** Approved
**Topic:** Expand the tech stack details (Cloudflare, Backblaze B2, best practices) and resolve overflow container clipping warnings.

---

## 1. Objectives
- **Detail typical architecture:** Showcase a professional-grade production stack (Cloudflare CDN, Backblaze B2 object storage, Bandwidth Alliance zero-egress, responsive asset pipeline, CI/CD).
- **Correct layout clipping warnings:** Replace `overflow: hidden` on `.work-tier-clip` with `clip-path` and remove `overflow: hidden` from `.intro-overlay` to satisfy modern web static analysis checks without visual regression.

---

## 2. Proposed Changes

### 2.1 Stack Expansion
- **File:** `src/lib/work_plans.ts`
- **Updates:**
  Update `sharedStack` list to:
  1. **Frameworks:** Astro, Next.js, or React + PostgreSQL / Supabase.
  2. **Edge Network:** Cloudflare CDN (global caching, DDoS protection, sub-50ms TTFB).
  3. **Object Storage:** Backblaze B2 + Cloudflare Bandwidth Alliance (zero egress fees for media assets).
  4. **Performance Pipeline:** Next-gen responsive image optimization (WebP/AVIF) and edge-cached asset routing.
  5. **Continuous Deployment:** Git-triggered automated previews (Vercel, Railway, or Cloudflare Pages).

### 2.2 Card Clipping & Ribbon Layout
- **File:** `src/pages/work.astro`
- **Markup:**
  Keep `<div class="work-tier-clip">`.
- **CSS:**
  Update `.work-tier-clip` to use `clip-path` instead of `overflow: hidden`:
  ```css
  .work-tier-clip {
    position: relative;
    width: 100%;
    height: 100%;
    clip-path: inset(0 round 1.35rem);
  }
  ```

### 2.3 Intro Overlay Layout
- **File:** `src/components/LoadingScreen.astro`
- **CSS:**
  Remove `overflow: hidden;` from `.intro-overlay` class.
