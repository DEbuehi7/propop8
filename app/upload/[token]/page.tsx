/**
 * app/upload/[token]/page.tsx
 * ----------------------------------------------------------------------------
 * Thin server component. Its only job is unwrapping `params`.
 *
 * In Next 15 `params` is a Promise; in Next 14 it's a plain object. Awaiting
 * handles both — `await` on a non-promise returns the value — so this file
 * doesn't need to know which version you're on. The client component below it
 * receives a plain string.
 *
 * noindex matters here: this URL is a bearer credential. It should never end
 * up in a search index or a referrer chain.
 */

import type { Metadata } from 'next';
import UploadClient from './UploadClient';

export const metadata: Metadata = {
  title: 'Upload your export — PropOps8',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string }> | { token: string };
}) {
  const { token } = await params;
  return <UploadClient token={token} />;
}
