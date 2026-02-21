import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSharedLink } from "@/lib/db";

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Shared pages - public with aggressive caching
  if (pathname.startsWith("/s/")) {
    const id = pathname.split("/")[2];
    if (id) {
      const sharedLink = await getSharedLink(id);
      const response = NextResponse.next();
      if (sharedLink?.type === 'snapshot') {
        // Snapshots are immutable - cache forever
        response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // Conversations/documents - cache 24h, hard reload clears it
        response.headers.set('Cache-Control', 'public, max-age=86400');
      }
      return response;
    }
    return NextResponse.next();
  }

  // Public paths that don't need authentication
  const publicPaths = [
    "/login",
    "/api/auth/login",
    "/uploads/",
    "/_next",
    "/static",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/sw.js",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/screenshot-mobile.png",
    "/screenshot-desktop.png",
  ];

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get("auth-token")?.value;

  if (!authToken || !(await verifyToken(authToken))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (except /api/auth/login which is handled manually above, but we want to protect other APIs)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
