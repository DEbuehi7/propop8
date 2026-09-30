/**
 * proxy.ts
 * ----------------------------------------------------------------
 * Renamed from middleware.ts for Next.js 16's proxy convention.
 * Same job -- gates everything under /admin behind the session
 * cookie set by app/api/admin/login/route.ts -- two things changed:
 * the filename and the exported function are now `proxy`, and this
 * now runs on the Node.js runtime rather than Edge (Next.js 16
 * doesn't allow choosing between them for this file anymore).
 *
 * WORTH KNOWING, NOT ACTING ON: lib/adminAuth.ts uses Web Crypto
 * instead of Node's `crypto` module specifically so verifySessionCookie()
 * works unmodified in both middleware (Edge) and the API routes (Node).
 * Now that this runs on Node.js too, that original reason no longer
 * applies here -- but Web Crypto works fine on Node.js as well, and
 * the API routes still benefit from sharing one implementation, so
 * there's nothing to change in adminAuth.ts. Just worth knowing the
 * constraint that shaped that file's design is now historical.
 *
 * Drop this at the ROOT of the project (same level as app/, next to
 * package.json) -- same location rule proxy.ts has as middleware.ts did.
 *
 * DELETE the old middleware.ts once this is in place. Having both
 * present is the same class of conflict as the page/route error from
 * last message -- two files claiming the same responsibility.
 */
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionCookie } from "@/lib/adminAuth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/login")) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (await verifySessionCookie(cookie)) return NextResponse.next();

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
