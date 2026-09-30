import type { Metadata } from 'next';
import LedgerCheck from '@/components/LedgerCheck';

export const metadata: Metadata = {
  title: 'Ledger screening',
  description: 'Screen a rent-roll export in your browser. Nothing is transmitted.',
  openGraph: {
    title: 'Ledger screening',
    description: 'Screen a rent-roll export in your browser. Nothing is transmitted.',
    url: 'https://propops8.com/ingest',
    images: [{ url: '/og/calculator.png', width: 1200, height: 630 }],
  },
  twitter: {
    title: 'Ledger screening',
    description: 'Screen a rent-roll export in your browser. Nothing is transmitted.',
    images: ['/og/calculator.png'],
  },
};

export default function IngestPage() {
  return <LedgerCheck ctaHref="/audit" />;
}
