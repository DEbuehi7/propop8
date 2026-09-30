/**
 * lib/legal-content.ts
 * ----------------------------------------------------------------------------
 * Content for the three /legal/[slug] pages. Structured as sections (heading
 * + paragraphs) so [slug]/page.tsx can map over one shape for all three
 * documents rather than three differently-structured pages.
 *
 * DRAFT, not legal advice. Built from policies already committed to
 * elsewhere on this site (audit-page.tsx, the thank-you page, the footer
 * disclosure, and the earlier build notes on retention/refunds) — not
 * invented from generic boilerplate. Have a California attorney read this
 * before it carries real payment volume; the DRE-licensee-adjacent business
 * activity is the part that is specific to you and not something a template
 * covers correctly by default.
 *
 * Last assembled: content as of the current site copy (Sept 2026). Update
 * the `updated` field on a doc whenever you materially change its policy —
 * not for typo fixes.
 */

export interface LegalSection {
  heading: string;
  body: string[]; // one string per paragraph
}

export interface LegalDoc {
  slug: 'privacy' | 'terms' | 'refunds';
  title: string;
  updated: string; // e.g. 'September 2026'
  intro: string;
  sections: LegalSection[];
}

const ENTITY = 'Smiling Bubbles Inc., doing business as PropOps8';
const CONTACT = 'daniel@propops8.com';
const DRE_LINE =
  'Daniel Osazee Ebuehi, California DRE #02224369, under broker Ed Bonilla, DRE #00752861, Keller Williams South East Los Angeles, 8255 Firestone Blvd Ste 100, Downey CA 90241.';

export const LEGAL_DOCS: Record<LegalDoc['slug'], LegalDoc> = {
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    updated: 'September 2026',
    intro:
      'This describes what PropOps8 collects, why, and how long it is kept. If something here is unclear, write to ' +
      CONTACT +
      ' and ask — that gets a real answer, not a form letter.',
    sections: [
      {
        heading: 'Who this is',
        body: [
          `PropOps8 is operated by ${ENTITY}. ${DRE_LINE} PropOps8 provides operational data analysis. It is not real estate brokerage, property management, legal, tax, or investment advice, and no agency relationship is created by using this site.`,
        ],
      },
      {
        heading: 'The free tools',
        body: [
          'The vacancy diagnostic and the ledger-screening tool run entirely in your browser. The numbers you enter are not sent anywhere — there is nothing to collect, because nothing transmits.',
        ],
      },
      {
        heading: 'What the paid audit collects',
        body: [
          'Starting an audit means providing a name, an email address, and the operational export you choose to send (work orders, vacancy/turn data, vendor invoices — CSV or XLSX).',
          'Uploads should be de-identified operational data only. Do not include resident names, Social Security numbers, financial account information, medical information, or other sensitive personal information. Unit identifiers, dates, categories, vendors, and costs are all the analysis uses. If a file arrives with information beyond that, it is used only to complete the analysis you requested and is deleted on the same schedule as everything else — it is not a reason for a longer retention window or a different use.',
          'Files are held in private storage reachable only by a link issued to you, not a public folder. Source files are deleted 30 days after upload. Requesting a refund deletes them immediately, ahead of that window.',
        ],
      },
      {
        heading: 'Payment information',
        body: [
          'Payment is collected through Tally\u2019s payment form, processed by Stripe. Card details are handled entirely by Stripe and never reach PropOps8\u2019s own systems or storage.',
        ],
      },
      {
        heading: 'Who else touches this data',
        body: [
          'The intake form and payment collection run on Tally. Payment processing runs on Stripe. Data storage and workflow automation run on Supabase and n8n. Email delivery runs on Resend. Each handles only the piece relevant to its function — form data goes to Tally and Supabase, payment goes to Stripe, notification email goes through Resend.',
          'Data is not sold. It is not used for advertising, and it is not shared with anyone outside the service providers above except as needed to deliver the audit you requested or as required by law.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You can ask what is held about you, ask for it to be deleted, or ask a question about any of this, by writing to ' +
            CONTACT +
            '. California residents have rights under the California Consumer Privacy Act to know, delete, and opt out of the sale of personal information — this site does not sell personal information, so there is nothing to opt out of, but the request channel above still applies to any other question.',
        ],
      },
      {
        heading: 'Changes',
        body: [
          'If this policy changes in a way that affects how existing data is handled, the date above will change and, where practical, customers with an open or recent audit will be told directly rather than left to notice a date change on their own.',
        ],
      },
    ],
  },

  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    updated: 'September 2026',
    intro:
      'These are the terms for using propops8.com and purchasing an Operations Audit. Using the site or paying for an audit means you agree to them.',
    sections: [
      {
        heading: 'What this is, and what it is not',
        body: [
          `PropOps8 is operated by ${ENTITY}. ${DRE_LINE}`,
          'PropOps8 provides operational data analysis: pattern-finding in maintenance, vacancy, and vendor data you choose to submit. It is not real estate brokerage, property management, legal, tax, or investment advice, and using this site does not create an agency, advisory, or fiduciary relationship of any kind.',
        ],
      },
      {
        heading: 'The service',
        body: [
          'Two free tools — a vacancy diagnostic and a ledger-screening tool — run in your browser and transmit nothing.',
          'The paid Operations Audit ($497, one time, no subscription) is a written findings report plus a 30-minute review call, built from the export you submit after payment.',
        ],
      },
      {
        heading: 'What "48-hour turnaround" means',
        body: [
          'The 48-hour window is a target, not a guaranteed delivery time, and it starts when your files arrive through the upload link — not at the moment of payment. If a submission is unusually large, malformed, or needs clarification before it can be analyzed, you will be told promptly rather than left waiting past the window without word.',
        ],
      },
      {
        heading: 'What you submit',
        body: [
          'Submit de-identified operational data only — no resident names, Social Security numbers, financial account details, or medical information. You are responsible for making sure you have the right to share the data you submit, and for your own organization\u2019s regulatory obligations around that data (including, where applicable, program-compliance requirements for HUD-assisted or other subsidized housing). PropOps8 does not advise on whether your data-handling practices satisfy those requirements.',
        ],
      },
      {
        heading: 'What a finding is, and is not',
        body: [
          'A report states the pattern found in your data and the method used to measure it, and says so plainly where the data can\u2019t support a conclusion. No theoretical savings claims, no invented examples, no round numbers without the arithmetic shown.',
          'Findings are observations about operational data, not allegations about a vendor or a staff member, and not brokerage, legal, or accounting advice. PropOps8 does not inspect your property, interview your staff, or verify your export against source documents — the analysis is only as accurate as what you submit.',
        ],
      },
      {
        heading: 'Payment and refunds',
        body: [
          'Payment is collected through Tally, processed by Stripe, as a one-time fee. Refunds are governed by the separate Refund Policy at /legal/refunds.',
        ],
      },
      {
        heading: 'Ownership',
        body: [
          'You own the data you submit. You own the report once delivered, for your own internal use. PropOps8 retains the underlying methodology and report format and may reuse the general approach for other clients — a report is never shared, and no identifying details from your portfolio are reused, without your separate written permission.',
        ],
      },
      {
        heading: 'No warranty, limited liability',
        body: [
          'The service, the free tools, and any report are provided as-is, without warranty of any kind, express or implied. PropOps8\u2019s total liability arising from the service is limited to the amount you paid for the audit. Nothing here limits liability where the law does not allow it to be limited.',
        ],
      },
      {
        heading: 'Governing law',
        body: ['These terms are governed by the laws of the State of California.'],
      },
      {
        heading: 'Changes',
        body: [
          'These terms may be updated as the service changes. The date above reflects the current version; continued use after a change means you accept the update.',
        ],
      },
      {
        heading: 'Contact',
        body: ['Questions before you buy: ' + CONTACT + ' — answered personally, not by a team.'],
      },
    ],
  },

  refunds: {
    slug: 'refunds',
    title: 'Refund Policy',
    updated: 'September 2026',
    intro:
      'This covers the $497 Operations Audit specifically. The free vacancy diagnostic and ledger-screening tool involve no payment, so nothing here applies to them.',
    sections: [
      {
        heading: 'Full refund window',
        body: [
          'You can request a full refund any time before analysis of your submitted files has begun. "Begun" means work has started on your specific export — not simply that the 48-hour window has opened.',
        ],
      },
      {
        heading: 'After analysis begins',
        body: [
          'Once analysis has started, the audit is not refundable. This is a data-analysis service, not a physical good — the work itself is the product, and it cannot be "returned" once performed.',
        ],
      },
      {
        heading: 'What happens to your files if you refund',
        body: [
          'Requesting a refund deletes your uploaded files immediately, ahead of the standard 30-day retention window described in the Privacy Policy. Nothing from a refunded submission is analyzed, retained past deletion, or reused.',
        ],
      },
      {
        heading: 'How to request one',
        body: [
          'Write to ' +
            CONTACT +
            ' from the email address used at checkout. Refunds are processed back to the original payment method through Stripe; timing after that point depends on Stripe and your bank, typically 5\u201310 business days.',
        ],
      },
      {
        heading: 'The $49 and $99 digital kits',
        body: [
          'The Property Operations Automation Kit and the Vendor Ledger & NOI Audit Kit are sold through Gumroad, not through this policy. Refunds for those follow Gumroad\u2019s own policy and process, since Gumroad is the seller of record for digital downloads.',
        ],
      },
    ],
  },
};

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS[slug as LegalDoc['slug']];
}

export const LEGAL_SLUGS = Object.keys(LEGAL_DOCS) as LegalDoc['slug'][];
