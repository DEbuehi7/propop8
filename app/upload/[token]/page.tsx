/**
 * app/upload/[token]/page.tsx
 * ----------------------------------------------------------------------------
 * Server Component wrapper -- same split as app/audit/page.tsx + AuditForm.tsx,
 * for the same reason documented there: a Client Component can't export
 * `metadata` in the App Router. All the actual upload logic lives in
 * ./UploadClient; this file's only job is extracting the token param and
 * handing it off.
 *
 * This REPLACES the founder-profile content previously wired into this exact
 * route. That content belongs at /about, and already lives there now.
 */
import type { Metadata } from 'next';
import UploadClient from './UploadClient';

export const metadata: Metadata = {
  title: 'Upload your export — PropOps8',
  robots: { index: false, follow: false },
};

export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <UploadClient token={token} />;
}
