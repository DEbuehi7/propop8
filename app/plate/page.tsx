import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Plate8',
  description: 'PropOps8 internal entertainment rig.',
  robots: { index: false, follow: false },
  // Added to the iPhone home screen, /plate launches with no Safari chrome.
  appleWebApp: {
    capable: true,
    title: 'Plate8',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/plate-favicon.png', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/plate-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0B0B10',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

/**
 * Plate is a self-contained page served from /public/plate/index.html.
 *
 * It runs in an iframe on purpose: its stylesheet is global and would
 * otherwise collide with Tailwind, and an iframe keeps the two apart
 * with no build step and no shared state.
 *
 * The site header is sticky at z-index 50, so this sits above it —
 * the rig manages its own full-height layout and has nowhere to put
 * 57px of site chrome. Navigate back to leave.
 */
export default function PlatePage() {
  return (
    <>
      {/* scoped to this route: unmounts with the page, so nothing leaks */}
      <style>{`html,body{overflow:hidden!important;overscroll-behavior:none}`}</style>
      <main
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: '#0B0B10',
        }}
      >
        <iframe
          src="/plate/index.html"
          title="Plate8"
          allow="microphone; autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </main>
    </>
  );
}
