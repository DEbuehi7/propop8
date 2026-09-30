/**
 * app/legal/[slug]/page.tsx
 * ----------------------------------------------------------------------------
 * Privacy, Terms, and Refunds at /legal/privacy, /legal/terms, /legal/refunds.
 * One file, three routes, one shell — so the three documents can never drift
 * apart in styling or in the facts they state.
 *
 * NOT LEGAL ADVICE. This is a working draft built from what you told me:
 * full refund before analysis begins, none after; 30-day retention on source
 * files. It reflects your actual stated practice, which is the important part —
 * a policy you don't follow is worse than no policy. Have a California
 * attorney review before you take real money, particularly the DRE disclosure
 * and the affordable-housing data handling.
 *
 * THE DRE LINE IS THE URGENT ONE. California requires a licensee to display
 * their licence number and their responsible broker's on materials that could
 * be read as soliciting real estate business. An operations audit sold by a
 * licensed agent to property owners sits close enough to that line that the
 * disclosure costs nothing and the omission is a regulator problem, not a
 * customer one.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  PALETTE,
  MONO,
  DISPLAY,
  hexA,
  shellStyle,
  bodyStyle,
  cardStyle,
  utilityLabel,
  eyebrowTab,
  headingStyle,
  sharedCss,
} from '@/lib/chaosTokens';

/* -------------------------------------------------------------------------- */
/*  Facts — stated once, used by all three documents                           */
/* -------------------------------------------------------------------------- */

const LAST_UPDATED = 'August 2026';
const RETENTION_DAYS = 30;
const CONTACT = 'daniel@propops8.com';

const ENTITY = 'Smiling Bubbles Inc.';
const OPERATOR = 'Daniel Osazee Ebuehi';
const DRE = '02224369';
const BROKER = 'Ed Bonilla';
const BROKER_DRE = '00752861';
const BROKERAGE = 'Keller Williams South East Los Angeles';
const BROKER_ADDRESS = '8255 Firestone Blvd Ste 100, Downey CA 90241';

interface Section {
  h: string;
  p: string[];
}

interface Doc {
  slug: string;
  title: string;
  eyebrow: string;
  intro: string;
  sections: Section[];
}

/* -------------------------------------------------------------------------- */
/*  Documents                                                                  */
/* -------------------------------------------------------------------------- */

const DOCS: Doc[] = [
  /* ------------------------------------------------------------- privacy */
  {
    slug: 'privacy',
    title: 'Privacy policy',
    eyebrow: 'PropOps8 // Privacy',
    intro: `How PropOps8 handles the data you send, and what is deliberately never collected. Last updated ${LAST_UPDATED}.`,
    sections: [
      {
        h: 'What the free tools collect',
        p: [
          'Nothing. The vacancy calculator and the ledger screening tool run entirely in your browser. No file you drop into them is uploaded, and no figure you enter is transmitted, logged, or stored. Close the tab and it is gone.',
          'You can verify this yourself: open your browser\u2019s developer tools, switch to the Network tab, and use either tool. No request is made.',
        ],
      },
      {
        h: 'What the audit intake collects',
        p: [
          'When you submit the audit form we receive your name, business or portfolio name, work email, role, portfolio size, the type of data you can export, and your description of the problem you want answered.',
          'If you arrived from the calculator, the figures you saw there travel with your submission. They are numbers you entered — days and dollar amounts — not identifying information.',
          'The form and payment are handled by Tally, whose payment processing runs on Stripe. Card details never reach this site and are never stored by us.',
        ],
      },
      {
        h: 'What you upload, and what you must not',
        p: [
          'After payment you receive a private link to upload your operational exports. Send de-identified data only: unit identifiers, dates, categories, vendors, and costs are all the analysis uses.',
          'Do not upload resident or tenant names, Social Security numbers, dates of birth, financial account numbers, payment card numbers, medical or disability information, immigration status, or any other sensitive personal information.',
          'The upload page screens CSV column headers in your browser before anything is sent, and refuses files whose columns indicate personal data. That screening is a safeguard, not a guarantee — spreadsheet formats are not screened, and no automated check substitutes for your own review before sending.',
        ],
      },
      {
        h: `Retention — ${RETENTION_DAYS} days`,
        p: [
          `Source files you upload are deleted ${RETENTION_DAYS} days after your findings report is delivered. The report itself, and the record of your engagement, are kept longer for tax and accounting purposes.`,
          'You may request earlier deletion at any time by emailing ' + CONTACT + '. Deletion of source files does not require deletion of the delivered report, which is yours as much as ours.',
        ],
      },
      {
        h: 'Where it is stored',
        p: [
          'Uploaded files go to private cloud storage reachable only through a time-limited link issued to you. Upload links expire after 14 days and are revoked when a replacement is issued. The storage is not public and is not indexed.',
          'Intake records are held in a managed Postgres database with access restricted to server-side credentials.',
        ],
      },
      {
        h: 'Who else sees it',
        p: [
          'Service providers that make the site work: Tally (forms and payment), Stripe (payment processing), Supabase (database and file storage), Resend (transactional email), Netlify and Cloudflare (hosting and delivery). Each sees only what its function requires.',
          'Your data is not sold, rented, or shared for advertising. There is no advertising on this site and no third-party tracking.',
        ],
      },
      {
        h: 'California residents',
        p: [
          'If you are a California resident you may request access to, correction of, or deletion of personal information we hold about you, and you may ask us not to sell or share it. We do not sell or share personal information. Email ' + CONTACT + ' to make a request.',
          'We will not discriminate against you for exercising any of these rights.',
        ],
      },
      {
        h: 'Changes',
        p: [
          'Material changes to this policy will be reflected in the date at the top. Continued use after a change constitutes acceptance of the revised policy.',
        ],
      },
    ],
  },

  /* --------------------------------------------------------------- terms */
  {
    slug: 'terms',
    title: 'Terms of service',
    eyebrow: 'PropOps8 // Terms',
    intro: `The terms on which PropOps8 provides the free tools and the paid Operations Audit. Last updated ${LAST_UPDATED}.`,
    sections: [
      {
        h: 'Who you are contracting with',
        p: [
          `PropOps8 is operated by ${ENTITY} ("we", "us"). Contact: ${CONTACT}.`,
        ],
      },
      {
        h: 'What the audit is, and what it is not',
        p: [
          'The Operations Audit is an analysis of operational data you supply. It identifies patterns in vacancy timelines, maintenance work orders, and vendor spend, and presents findings for your consideration.',
          'It is not real estate brokerage, property management, legal, tax, accounting, engineering, or investment advice. It does not value property, does not recommend transactions, and does not create an agency relationship of any kind.',
          'Findings are observations about the data you provided. They are not assertions of fact about your vendors, employees, or contractors, and they do not allege wrongdoing by anyone. A vendor holding a large share of spend is a fact about a ledger, not a finding of overbilling.',
        ],
      },
      {
        h: 'The analysis is only as good as the export',
        p: [
          'Findings depend entirely on the completeness and accuracy of the data you send. Missing fields, mis-keyed dates, and inconsistent categories all limit what can be concluded, and the report states its own limitations where they apply.',
          'We do not verify your data against source documents, inspect properties, or interview staff. Nothing in a report should be acted on as though it were an audited financial statement.',
        ],
      },
      {
        h: 'Free tools',
        p: [
          'The calculator and screening tools are provided as-is for informational purposes. They compute arithmetic from figures you enter. The results are estimates based on your inputs, are not verified against any source, and are not a valuation, an appraisal, or a statement of loss.',
        ],
      },
      {
        h: 'Your responsibilities',
        p: [
          'You confirm that you are authorised to share the data you upload, and that doing so does not breach any agreement, lease, management contract, or law that applies to you.',
          'You are responsible for de-identifying data before sending it. See the privacy policy for what must be stripped.',
          'Where you manage government-assisted or affordable housing, you remain solely responsible for your obligations under the applicable program, including any restrictions on disclosing resident data.',
        ],
      },
      {
        h: 'Delivery',
        p: [
          'We aim to deliver findings within 48 hours of receiving usable files, and will tell you promptly if an export needs work before analysis can begin. The 48-hour target is a goal, not a guarantee.',
        ],
      },
      {
        h: 'Digital products',
        p: [
          'Workbooks and kits sold through Gumroad are licensed to you for your own business use. You may not resell, redistribute, or publish them. Gumroad\u2019s own terms and refund policy apply to those purchases.',
        ],
      },
      {
        h: 'Limitation of liability',
        p: [
          'To the fullest extent permitted by law, our total liability arising from or relating to the services is limited to the amount you paid for the specific engagement giving rise to the claim.',
          'We are not liable for indirect, incidental, consequential, or punitive damages, or for lost profits, lost rents, or lost business opportunities.',
          'Nothing here limits liability that cannot be limited by law.',
        ],
      },
      {
        h: 'Governing law',
        p: [
          'These terms are governed by the laws of the State of California. Any dispute will be brought in the state or federal courts located in Los Angeles County, California.',
        ],
      },
    ],
  },

  /* ------------------------------------------------------------- refunds */
  {
    slug: 'refunds',
    title: 'Refund policy',
    eyebrow: 'PropOps8 // Refunds',
    intro: `When you can get your money back, stated plainly. Last updated ${LAST_UPDATED}.`,
    sections: [
      {
        h: 'Full refund before analysis begins',
        p: [
          'If you have paid for an Operations Audit and analysis has not yet started, email ' + CONTACT + ' and you get the full amount back. No conditions, no explanation needed.',
          'Analysis begins when we open your uploaded files. Until then, the refund is automatic on request.',
        ],
      },
      {
        h: 'After analysis begins',
        p: [
          'Once we have begun working through your export, the fee is non-refundable. The work is the product, and by that point it has been done.',
          'If the delivered report is materially not what was described — a section promised and absent, an analysis that could not be run and was not disclosed — say so and we will correct it or refund it. That is a defect, not a change of mind.',
        ],
      },
      {
        h: 'If your data cannot be analysed',
        p: [
          'Sometimes an export lacks the fields the analysis needs. If we cannot produce a meaningful report from what you can supply, we will say so before starting and refund you in full.',
          'You will never be charged for a report we could not honestly produce.',
        ],
      },
      {
        h: 'Digital products',
        p: [
          'Workbooks and kits purchased through Gumroad are covered by Gumroad\u2019s refund process. Request those through Gumroad directly, or email us and we will help.',
        ],
      },
      {
        h: 'How refunds are issued',
        p: [
          'Refunds go back to the original payment method. Processing typically takes 5\u201310 business days depending on your bank.',
          'Requesting a refund also deletes your uploaded files immediately, ahead of the normal ' + RETENTION_DAYS + '-day retention window.',
        ],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Routing                                                                    */
/* -------------------------------------------------------------------------- */

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOCS.find((d) => d.slug === slug);
  const title = doc?.title ?? 'Legal';
  const description = doc?.intro;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title: `${title} — PropOps8`,
      description,
      url: doc ? `https://propops8.com/legal/${doc.slug}` : undefined,
      images: [{ url: '/og/calculator.png', width: 1200, height: 630 }],
    },
    twitter: {
      title: `${title} — PropOps8`,
      description,
      images: ['/og/calculator.png'],
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await params;
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) notFound();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: PALETTE.void,
        padding: '48px 16px',
        fontFamily: DISPLAY,
      }}
    >
      <style>{sharedCss}</style>

      <div className="w-full mx-auto overflow-hidden" style={{ ...shellStyle, maxWidth: 760 }}>
        <div className="p-5 sm:p-7" style={bodyStyle}>
          <div className="inline-flex items-center" style={eyebrowTab}>
            {doc.eyebrow}
          </div>

          <h1 className="uppercase" style={{ ...headingStyle, margin: '18px 0 10px' }}>
            {doc.title}
          </h1>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.55,
              color: hexA('#ffffff', 0.66),
              margin: '0 0 26px',
            }}
          >
            {doc.intro}
          </p>

          {doc.sections.map((s) => (
            <section key={s.h} style={{ marginBottom: 26 }}>
              <h2
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: 17,
                  lineHeight: 1.3,
                  color: PALETTE.bright,
                  margin: '0 0 10px',
                }}
              >
                {s.h}
              </h2>
              {s.p.map((para, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: hexA('#ffffff', 0.7),
                    margin: '0 0 12px',
                  }}
                >
                  {para}
                </p>
              ))}
            </section>
          ))}

          {/* ------------------------------------------- licence disclosure */}
          <div className="p-5" style={{ ...cardStyle, marginTop: 8 }}>
            <div style={utilityLabel}>Licence disclosure</div>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.85,
                letterSpacing: '0.03em',
                color: hexA('#ffffff', 0.6),
                margin: '12px 0 0',
              }}
            >
              {OPERATOR} is a licensed California real estate salesperson, DRE #{DRE}, under{' '}
              {BROKER}, DRE #{BROKER_DRE}, {BROKERAGE}, {BROKER_ADDRESS}.
              <br />
              <br />
              PropOps8 provides operational data analysis. It is not real estate brokerage,
              property management, legal, tax, or investment advice, and no agency relationship is
              created by using this site or purchasing an audit.
            </p>
          </div>

          <div
            className="flex flex-wrap gap-4"
            style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${hexA('#ffffff', 0.07)}` }}
          >
            {DOCS.filter((d) => d.slug !== doc.slug).map((d) => (
              <a
                key={d.slug}
                href={`/legal/${d.slug}`}
                className="chaos-focus"
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: PALETTE.cyan,
                  textDecoration: 'none',
                }}
              >
                {d.title} &rarr;
              </a>
            ))}
            <a
              href={`mailto:${CONTACT}`}
              className="chaos-focus"
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: hexA('#ffffff', 0.6),
                textDecoration: 'none',
              }}
            >
              {CONTACT}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
