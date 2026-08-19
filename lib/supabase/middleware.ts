import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// '/' is the marketing landing page, shown to every visitor regardless of
// session (app/page.tsx no longer redirects an authenticated user away).
// '/track' is the no-login shipment tracker customers use directly.
// '/register' and '/verify-email' back self-service signup — same
// treatment as '/accept-invite', reachable with no session by design.
// Everything else requires a session.
const PUBLIC_PATHS = ['/', '/login', '/accept-invite', '/track', '/register', '/verify-email', '/terms', '/privacy'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // Every public path except /login never branches on auth status below —
  // an anonymous or signed-in visitor sees the same response either way.
  // Skip the Supabase Auth server round trip entirely for them: getUser()
  // validates the token against the Auth server over the network (unlike
  // decoding the JWT locally), so this was a full extra network hop on
  // every visit to the landing page, the public tracker, registration,
  // etc. for a result nothing here reads. Protected paths and /login
  // (which DOES branch on auth status — signed-in users get bounced to
  // /dashboard) still call it, unchanged, since that's the one place the
  // real security guarantee — the token must be revalidated, not merely
  // decoded — actually matters.
  if (isPublicPath && path !== '/login') {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === '/login') {
    const redirectUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
