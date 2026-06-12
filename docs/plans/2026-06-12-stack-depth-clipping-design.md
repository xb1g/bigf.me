# Design Document: Stack Depth, Clipping Refinements & Enterprise AI Advisory

**Date:** 2026-06-12
**Status:** Approved
**Topic:** Expand the tech stack details (Cloudflare, Backblaze B2, best practices), resolve overflow container clipping warnings, and add a professional SME/Enterprise AI Adoption Consultation section.

---

## 1. Objectives
- **Detail typical architecture:** Showcase a professional-grade production stack (Cloudflare CDN, Backblaze B2 object storage, Bandwidth Alliance zero-egress, responsive asset pipeline, CI/CD).
- **Correct layout clipping warnings:** Replace `overflow: hidden` on `.work-tier-clip` with `clip-path` and remove `overflow: hidden` from `.intro-overlay` to satisfy modern web static analysis checks without visual regression.
- **Enterprise AI Advisory:** Add a dedicated, professional-grade callout section on the `/work` page outlining SME & Enterprise AI Adoption consultation services (custom LLM feasibility, security & privacy audits, workflow automation).

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

### 2.4 Enterprise AI Advisory Section
- **File:** `src/pages/work.astro`
- **Markup:**
  Add a new section before the Reference section:
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
