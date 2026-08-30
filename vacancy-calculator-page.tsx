/**
 * app/tools/vacancy-calculator/page.tsx
 * ----------------------------------------------------------------------------
 * OVERWRITE the existing file at this path completely. What's there now is
 * corrupted — `from 'react'i` with a stray character, and a function signature
 * reading `VacancyCalculaexport d) {`. Something mangled it mid-write. It is
 * not worth reading; replace the whole file.
 *
 * This is the URL published in every LinkedIn post and all three emails, so it
 * has to resolve and it has to be the real calculator — the one that splits
 * operational vacancy from leasing vacancy, not a generic loss estimator.
 */

import type { Metadata } from 'next';
import VacancyBlackHole from './VacancyBlackHole';

export const metadata: Metadata = {
  title: 'Vacancy diagnostic',
  description:
    'How many of your vacant days were operations, and how many were demand? Runs in your browser. Nothing is transmitted.',
  openGraph: {
    title: 'The Vacancy Black Hole — free diagnostic',
    description:
      'Separate make-ready delay from leasing delay in ten seconds. No signup.',
    images: [{ url: '/og/calculator.png', width: 1200, height: 630 }],
  },
};

export default function VacancyCalculatorPage() {
  return <VacancyBlackHole />;
}
