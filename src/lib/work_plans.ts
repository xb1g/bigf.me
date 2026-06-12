export interface Milestone {
  label: string;
  amount: number;
  trigger: string;
}

export interface WorkPackage {
  id: 'xs' | 'small' | 'medium' | 'large';
  name: string;
  tagline: string;
  timeline: string;
  totalThb: number;
  recommended?: boolean;
  /** Short ribbon on the tier card (e.g. "Most shipped") */
  badge?: string;
  /** Override default "40 / 40 / 20" label on the page */
  paymentLabel?: string;
  milestones: Milestone[];
  scope: string[];
  examples: string[];
  notIncluded: string[];
}

export const workMeta = {
  title: 'Software Build Plans',
  subtitle:
    'Build fast, test fast, learn fast. Fixed scope, milestone payments — ship in days or weeks, not months.',
  scopeNote:
    'Every tier locks features at kickoff so dates hold. Custom work outside the tier (new modules, extra integrations, native apps) moves to Phase 2 or a change order with a separate quote.',
  contactEmail: 'bunyasit@passionseed.org',
};

export const sharedProcess = [
  'Scope workshop → written spec → you approve before build starts',
  'Milestone payments tied to working demos, not slide decks',
  'Production deploy on your domain with handoff docs',
  '14-day post-launch window for critical bug fixes',
];

export const sharedStack = [
  'Modern frameworks: Astro, Next.js, or React + PostgreSQL / Supabase for rich state and robust data management.',
  'Global Edge Delivery: Cloudflare CDN integration for smart edge caching, DDoS protection, and sub-50ms TTFB.',
  'Zero-Egress Storage: Backblaze B2 S3-compatible object storage paired with Cloudflare Bandwidth Alliance for cost-free media delivery.',
  'Asset Optimization Pipeline: Next-gen responsive image compression (WebP/AVIF) and edge-cached asset routing.',
  'Continuous Deployment: Automated Git-triggered builds (Vercel, Railway, or Cloudflare Pages) with instant preview deployments.',
];

export const packages: WorkPackage[] = [
  {
    id: 'xs',
    name: 'XS',
    badge: 'Validate first',
    tagline: 'Scope call, written plan, one starter deliverable — credit toward Small if you upgrade within 30 days.',
    timeline: '3–5 days',
    totalThb: 49_000,
    paymentLabel: '50 / 50',
    milestones: [
      { label: 'Kickoff', amount: 24_500, trigger: 'Scope call + direction locked' },
      { label: 'Delivery', amount: 24_500, trigger: 'Written plan + starter surface live' },
    ],
    scope: [
      '90-minute scope & feasibility consult (video)',
      'Written brief: features, tier recommendation, timeline',
      'One starter deliverable — prototype page, waitlist on your domain, or roadmap doc',
      'Stack + architecture recommendation',
      '49,000 THB credited toward Small if you upgrade within 30 days',
    ],
    examples: [
      '“Is this buildable in two weeks?” sanity check',
      'Investor or partner demo before a real MVP',
      'Pick stack and scope before hiring anyone',
      'Unblock a stalled side project — clear next steps',
      'Cheap way to test demand with a live waitlist',
    ],
    notIncluded: [
      'Database, auth, or admin panel',
      'More than one primary screen / flow',
      'Custom integrations (LINE, Stripe, etc.)',
      'Production polish beyond starter quality',
      'Ongoing support after handoff',
    ],
  },
  {
    id: 'small',
    name: 'Small',
    tagline: 'MVP or launch surface — prove the idea and start collecting users.',
    timeline: '2 weeks',
    totalThb: 120_000,
    milestones: [
      { label: 'Deposit', amount: 48_000, trigger: 'Scope lock + design direction' },
      { label: 'Demo', amount: 48_000, trigger: 'Core flow working on staging' },
      { label: 'Launch', amount: 24_000, trigger: 'Live on your domain' },
    ],
    scope: [
      'Up to 5 screens or 1 primary user journey',
      'Mobile-responsive UI, production-ready polish',
      'Simple auth (OTP, magic link, or social — one method)',
      'Forms, waitlist, or lightweight CRUD as needed',
      'Deploy + DNS on your domain',
      'One revision round after demo',
    ],
    examples: [
      'Landing page + waitlist',
      'Portfolio or brochure site with contact flow',
      'Single-role tool (calculator, directory, booking request)',
      'Prototype demo for investors or partners',
    ],
    notIncluded: [
      'Admin dashboard or multi-user roles',
      'Payments, subscriptions, or complex workflows',
      'Third-party API integrations beyond one simple hook',
      'Custom mobile apps (iOS / Android)',
    ],
  },
  {
    id: 'medium',
    name: 'Medium',
    tagline: 'Production app — real users, admin ops, and one key integration.',
    timeline: '3 weeks',
    totalThb: 195_000,
    milestones: [
      { label: 'Deposit', amount: 78_000, trigger: 'Architecture + integration map' },
      { label: 'Demo', amount: 78_000, trigger: 'App + admin portal functional end-to-end' },
      { label: 'Launch', amount: 39_000, trigger: 'Production deployment' },
    ],
    scope: [
      'Everything in Small',
      'Up to 2 user roles (e.g. customer + admin, or member + staff)',
      'Database-backed features: create, edit, search, filter',
      'Admin panel: approve, reject, unpublish, basic metrics',
      'Media upload with automatic resize / compression',
      'One major integration (LINE Login, Stripe, Google, Slack, etc.)',
      'Email or LINE notifications for key events',
    ],
    examples: [
      'Two-sided marketplace (listings + sellers)',
      'Membership or course portal with admin',
      'Booking or scheduling platform',
      'Internal ops dashboard with CRUD',
      'Community site with moderation',
    ],
    notIncluded: [
      'Multiple payment rails or subscription billing logic',
      'Sub-50ms / multi-region performance tuning',
      'Complex RBAC (3+ roles with granular permissions)',
      'Native mobile apps',
    ],
  },
  {
    id: 'large',
    name: 'Large',
    badge: 'Most shipped',
    tagline: 'Full platform — speed, monetization, integrations, and ops at scale.',
    timeline: '4–6 weeks',
    totalThb: 265_000,
    recommended: true,
    milestones: [
      { label: 'Deposit', amount: 106_000, trigger: 'Architecture, data model, integration plan' },
      { label: 'Demo', amount: 106_000, trigger: 'All core roles and flows working on staging' },
      { label: 'Launch', amount: 53_000, trigger: 'Production go-live + handoff' },
    ],
    scope: [
      'Everything in Medium',
      'Multi-role platform (admin, vendor, buyer, etc.)',
      'Performance pass for your target region (edge CDN, image pipeline)',
      'Multiple integrations (auth, payments, messaging, analytics)',
      'Monetization hooks: subscriptions, ads, commissions, or lead routing',
      'Master admin: ban users, monitor activity, manage premium slots',
      'Observability basics: uptime, errors, key conversion events',
      'Phase 2 roadmap session included',
    ],
    examples: [
      'Full marketplace with LINE leads and dealer onboarding',
      'SaaS with billing and team accounts',
      'Edtech platform with payments and content admin',
      'Multi-vendor booking or rental platform',
      'B2B portal with approval workflows',
    ],
    notIncluded: [
      'Ongoing retainer or dedicated support SLA (available separately)',
      'Marketing, copywriting, photography, or SEO campaigns',
      'Legal, compliance audits, or penetration testing',
      'Projects requiring >6 weeks without a Phase 2 split',
    ],
  },
];

/** Optional reference — not a separate tier, just social proof */
export const referenceBuild = {
  title: 'Reference: Thai vehicle marketplace',
  summary:
    'Large-tier delivery in 3 weeks: LINE login, auto image compression, direct LINE OA leads, premium ad spots, master admin — 265,000 THB flat.',
};

export function formatThb(amount: number): string {
  return amount.toLocaleString('en-US');
}

export function milestoneSplit(total: number): [number, number, number] {
  const deposit = Math.round(total * 0.4);
  const demo = Math.round(total * 0.4);
  const launch = total - deposit - demo;
  return [deposit, demo, launch];
}
