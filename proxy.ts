import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";

const authMiddleware = withAuth({
  pages: {
    signIn: "/api/auth/signin",
  },
});

export default function middleware(request: NextRequest) {
  // GitHub now sends an `iss` query param (RFC 9207) in OAuth callbacks.
  // openid-client 5.x picks it up and tries OIDC issuer validation, which
  // fails because GitHub isn't an OIDC provider. Strip it only for GitHub.
  if (
    request.nextUrl.pathname === "/api/auth/callback/github" &&
    request.nextUrl.searchParams.has("iss")
  ) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("iss");
    return NextResponse.redirect(url);
  }

  // Auth protection for dashboard routes
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    return (
      authMiddleware as (
        req: NextRequest,
      ) => NextResponse | Promise<NextResponse>
    )(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/auth/callback/:path*"],
};
