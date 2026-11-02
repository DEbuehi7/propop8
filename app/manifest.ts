import type { MetadataRoute } from 'next';

// The public site as a home-screen web app: it opens full screen (no Safari
// bars) under the name PropOps8. The admin back end has its own manifest,
// public/propops8-ops.webmanifest, set in app/admin/layout.tsx. Icons come
// from scripts/brand/app-icons.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PropOps8',
    short_name: 'PropOps8',
    description: 'Find out where your property is losing money.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#070b14',
    theme_color: '#070b14',
    icons: [
      { src: '/icons/propops8-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/propops8-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
