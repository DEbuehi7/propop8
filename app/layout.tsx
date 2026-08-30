/**
 * app/layout.tsx
 * ----------------------------------------------------------------------------
 * Header and footer live here rather than in each page, so every route gets
 * them automatically — including /audit/thank-you and /upload/[token], which
 * otherwise leave a visitor with nothing but the browser back button.
 *
 * FONTS VIA <link>, NOT next/font — deliberate. chaosTokens.ts declares its
 * stacks as the literal strings 'Inter' and 'JetBrains Mono'. next/font
 * generates a hashed family name, so those literals would never match and
 * every page would silently fall back to system fonts. A plain stylesheet link
 * registers the real family names, so the tokens work with zero edits. If you
 * later switch to next/font for self-hosting, change both halves together or
 * you get system fonts and no error to tell you why.
 *
 * metadataBase matters more than it looks: without it the relative OG paths in
 * each page stay relative, and LinkedIn requires absolute URLs. A missing
 * metadataBase is the most common cause of a blank preview card.
 */

import type { Metadata, Viewport } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://propops8.com'),
  title: {
    default: 'PropOps8 — find out where your property is losing money',
    template: '%s — PropOps8',
  },
  description:
    'Operational vacancy vs. leasing vacancy, repeat callbacks, vendor concentration. Free diagnostic, no signup.',
  openGraph: {
    siteName: 'PropOps8',
    type: 'website',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#070b14',
  width: 'device-width',
  initialScale: 1,
  // Not maximumScale: 1 — locking zoom breaks the page for anyone who needs
  // it, and the mono type on these cards is small.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Column layout so the footer sits at the bottom on short pages
          (thank-you, 404) instead of floating mid-screen. */}
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <SiteHeader />
        <div id="main" style={{ flex: '1 0 auto' }}>
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
