import LedgerCheck from '@/components/LedgerCheck';

export const metadata = {
  title: 'Ledger screening',
  description: 'Screen a rent-roll export in your browser. Nothing is transmitted.',
};

export default function IngestPage() {
  return <LedgerCheck ctaHref="/audit" />;
}
