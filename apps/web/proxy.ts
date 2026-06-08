import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    pathname.startsWith(path),
  );

  const token = request.cookies.get('access_token')?.value;

  if (!token && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);

    
    const fullPath = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.searchParams.set('from', fullPath);

    return NextResponse.redirect(loginUrl);
  }

  if (token && isPublicPath) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};