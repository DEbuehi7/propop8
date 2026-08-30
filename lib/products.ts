/**
 * lib/products.ts
 * ----------------------------------------------------------------------------
 * Every purchase link in one place. Change a price or a slug here and it
 * changes on the landing page, the calculator, the ingest page, and anywhere
 * else that reads from this file.
 *
 * THE AUDIENCE SPLIT — the reason this file is structured in two halves.
 *
 * The Gumroad catalog serves two unrelated buyers:
 *
 *   PropOps8 products  → property operators, asset managers, PM companies.
 *                        They care about vacancy, turns, vendors, NOI.
 *   Code8 / Engine8    → developers building webhook and Supabase pipelines.
 *                        They care about idempotency and signature verification.
 *
 * Only PROPOPS8_LADDER belongs on propops8.com. An SRO housing director reading
 * about make-ready delay should never be shown "Webhook Hardening & Supabase
 * Logger Kit" — it reads as a different company's storefront and costs you the
 * credibility the rest of the page just built.
 *
 * DEVELOPER_PRODUCTS is kept here so the links exist in one place, but nothing
 * on the property-operator side of the site should import it. Give those their
 * own page or their own domain.
 *
 * PRICES MUST MATCH GUMROAD. A tier that says $39 on the site and charges $49
 * at checkout is the kind of thing a careful buyer treats as a warning sign.
 */

const GUMROAD = 'https://edoaim.gumroad.com/l';

export interface Product {
  /** Gumroad slug — the part after /l/ */
  slug: string;
  name: string;
  /** Display price. Must equal the Gumroad listing. */
  price: string;
  /** What the buyer gets, in their language, not yours. */
  body: string;
  /** Buyer-side CTA. Never "drive adoption of" or "sells the". */
  cta: string;
  href: string;
  featured?: boolean;
}

function gumroad(slug: string): string {
  return `${GUMROAD}/${slug}`;
}

/* -------------------------------------------------------------------------- */
/*  Property operators — this is what propops8.com sells                      */
/* -------------------------------------------------------------------------- */

/** On-site routes, not Gumroad. */
export const CALCULATOR = '/tools/vacancy-calculator';
export const INGEST = '/ingest';
export const AUDIT = '/audit';

export const PROPOPS8_LADDER: Product[] = [
  {
    slug: '',
    name: 'Vacancy diagnostic',
    price: 'Free',
    body: 'Your own numbers, in ten seconds, in the browser. Nothing transmits.',
    cta: 'Run it now',
    href: CALCULATOR,
  },
  {
    slug: 'PropOps8',
    name: 'Property Operations Automation Kit',
    price: '$49',
    body: 'The self-audit framework: what to export, what to measure, and the thresholds that separate a bad month from a bad process.',
    cta: 'Get the kit',
    href: gumroad('PropOps8'),
  },
  {
    slug: 'PropOps8VendorKit',
    name: 'Vendor Ledger & NOI Audit Kit',
    price: '$99',
    body: 'Vendor concentration benchmarking, spend variance rules, and the NOI impact worksheet. For portfolios past one property.',
    cta: 'Get the audit kit',
    href: gumroad('PropOps8VendorKit'),
  },
  {
    slug: '',
    name: 'Operations Audit',
    price: '$497',
    body: 'Send your export. Get back a prioritised findings report in 48 hours, plus a 30-minute review call.',
    cta: 'Start my audit',
    href: AUDIT,
    featured: true,
  },
];

/* -------------------------------------------------------------------------- */
/*  Developers — a different buyer. Do not render these on propops8.com.      */
/* -------------------------------------------------------------------------- */

export const DEVELOPER_PRODUCTS: Product[] = [
  {
    slug: 'Engine8Playbook',
    name: 'Webhook & Financial Data Hardening Playbook',
    price: 'Pay what you want',
    body: 'Idempotency, signature verification, and the failure modes that let a payment succeed while your database never hears about it.',
    cta: 'Read the playbook',
    href: gumroad('Engine8Playbook'),
  },
  {
    slug: 'Engine8Architecture',
    name: 'Engine8 Deep-Dive — Hardening & Architecture Guide',
    price: 'Pay what you want',
    body: 'The architecture behind the automation kit, written out.',
    cta: 'Read the guide',
    href: gumroad('Engine8Architecture'),
  },
  {
    slug: 'Code829',
    name: 'Code8 — Webhook Hardening & Supabase Logger Kit',
    price: '$29+',
    body: 'Signature verification, an idempotent event log, and the retry semantics that stop duplicate fulfilment.',
    cta: 'Get Code8',
    href: gumroad('Code829'),
  },
  {
    slug: 'Engine839',
    name: 'Engine8 — Production Revenue Automation Kit',
    price: '$39',
    body: 'Payment webhook to fulfilment, end to end, with the failure paths handled.',
    cta: 'Get Engine8',
    href: gumroad('Engine839'),
  },
  {
    slug: 'Engine8Bundle59',
    name: 'Revenue Stack — Code8 + Engine8',
    price: '$59',
    body: 'Both developer kits together.',
    cta: 'Get the stack',
    href: gumroad('Engine8Bundle59'),
  },
  {
    slug: 'PropOps8Bundle99',
    name: '8-Series Full Stack — Code8 + Engine8 + PropOps8',
    price: '$99',
    body: 'Everything, developer and operator side.',
    cta: 'Get the full stack',
    href: gumroad('PropOps8Bundle99'),
  },
];

/* -------------------------------------------------------------------------- */
/*  Named exports for one-off links                                            */
/* -------------------------------------------------------------------------- */

export const LINKS = {
  automationKit: gumroad('PropOps8'),
  vendorKit: gumroad('PropOps8VendorKit'),
  fullStack: gumroad('PropOps8Bundle99'),
  calculator: CALCULATOR,
  ingest: INGEST,
  audit: AUDIT,
} as const;

/**
 * NOTE ON THE TWO $99s: "Vendor Ledger & NOI Audit Kit" and "8-Series Full
 * Stack" are both $99 and completely different products. Shown on the same
 * pricing table they read as a mistake. Keep them on separate pages, or move
 * the bundle to a different price.
 *
 * NOTE ON THE MISSING FREE PDF: Email 1 of the sequence promises an "Ugly8
 * field guide" attachment. No such product exists on Gumroad. Either create it
 * as a $0+ listing for the operator audience, or rewrite Email 1 to lead with
 * the calculator, which is the free thing you actually have.
 */
