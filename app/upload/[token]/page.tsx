/**
 * app/upload/[token]/page.tsx
 * ----------------------------------------------------------------------------
 * This server component was previously a thin wrapper for params.
 * It has been modified to serve as the Owner/Founder Profile page.
 *
 * It displays a biography and three featured images.
 * ----------------------------------------------------------------------------
 */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

// 1. Update Metadata for the profile page
export const metadata: Metadata = {
  title: 'Founder Profile — Daniel Ebuehi | PropOps8',
  description: 'Learn more about Daniel Ebuehi, founder of PropOps8.',
};

// We probably want profile pages to be public and cacheable, so we can remove 'force-dynamic'
// export const dynamic = 'force-dynamic';

export default async function OwnerProfilePage() {
  // Placeholder data for the owner
  const owner = {
    name: 'Daniel Ebuehi',
    title: 'Founder & CEO, PropOps8',
    bio: [
      'Daniel Ebuehi is the founder of PropOps8, a platform dedicated to streamlining property operations and asset management through intelligent data analytics.',
      'With over a decade of experience in the real estate and technology sectors, Daniel has a proven track record of building innovative solutions that solve complex operational challenges.',
      'Before starting PropOps8, he held leadership roles in product management and operations at several high-growth startups.',
    ],
    // Replace these with your actual image paths from the /public folder
    images: [
      {
        src: '/images/founder-portrait.jpg',
        alt: 'Daniel Ebuehi professional portrait',
      },
      {
        src: '/images/propops8-hq.jpg',
        alt: 'Daniel at the PropOps8 headquarters',
      },
      {
        src: '/images/speaking-engagement.jpg',
        alt: 'Daniel speaking at a real estate technology conference',
      },
    ],
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header section */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-slate-950">
            PropOps<span className="text-sky-600">8</span>
          </Link>
          <div className="flex gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium hover:text-sky-600"
            >
              Dashboard
            </Link>
          </div>
        </nav>
      </header>

      {/* Main Profile Content */}
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
        <div className="grid md:grid-cols-[2fr,1fr] gap-12">
          {/* Left Column: Biography */}
          <section className="space-y-8">
            <div className="border-b border-slate-200 pb-6">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-950">
                {owner.name}
              </h1>
              <p className="text-xl text-sky-700 font-medium mt-2">
                {owner.title}
              </p>
            </div>

            <div className="space-y-6 text-lg text-slate-700 leading-relaxed">
              {owner.bio.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <div className="pt-8">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                Featured Images
              </h3>
            </div>
          </section>

          {/* Right Column: Contact/Links (Optional) */}
          <aside className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm self-start">
            <h2 className="text-xl font-bold mb-6">Connect</h2>
            <div className="space-y-4">
              <a
                href="mailto:daniel@propops8.com"
                className="block text-sky-700 hover:text-sky-800 font-medium"
              >
                daniel@propops8.com
              </a>
              <a
                href="https://linkedin.com/in/danielebuehi"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-600 hover:text-slate-900"
              >
                LinkedIn Profile
              </a>
            </div>
          </aside>
        </div>

        {/* 3. Image Gallery Section */}
        <section className="mt-16 md:mt-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {owner.images.map((image, index) => (
              <div
                key={index}
                className="relative aspect-square overflow-hidden rounded-3xl border border-slate-200 shadow-lg bg-white"
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  className="object-cover transition-transform duration-300 hover:scale-105"
                  sizes="(max-w-768px) 100vw, (max-w-1200px) 50vw, 33vw"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}