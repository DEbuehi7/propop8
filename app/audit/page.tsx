/**
 * app/audit/page.tsx
 * ----------------------------------------------------------------------------
 * Server Component wrapper. This is the one that owns the route's metadata —
 * a Client Component can't. All the interactive logic (URL snapshot reading,
 * the Tally embed) lives in ./AuditForm, unchanged.
 */

import type { Metadata } from 'next';
import AuditForm from './AuditForm';

export const metadata: Metadata = {
  title: 'Start your operations audit — PropOps8',
  description:
    'Send your existing work-order and turn exports. Get back a prioritised breakdown of where make-ready time, repeat maintenance and vendor spend are draining NOI.',
  openGraph: {
    title: 'Start your operations audit',
    description:
      'Send your existing work-order and turn exports. Get back a prioritised breakdown of where NOI is leaking, and what to fix first.',
    url: 'https://propops8.com/audit',
    images: [{ url: '/og/audit.png', width: 1200, height: 630 }],
  },
  twitter: {
    title: 'Start your operations audit — PropOps8',
    description: 'Send your export. Get back a prioritised findings report in 48 hours.',
    images: ['/og/audit.png'],
  },
};

export default function AuditPage() {
  return <AuditForm />;
}
