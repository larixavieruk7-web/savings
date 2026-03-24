import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Skip session refresh for auth callback
  if (request.nextUrl.pathname === '/auth/callback') {
    return NextResponse.next()
  }

  // Refresh Supabase session on every request
  const response = await updateSession(request)

  // Public routes — no auth check needed
  const isPublicRoute = request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth/') ||
    request.nextUrl.pathname.startsWith('/api/')

  if (!isPublicRoute) {
    // Check if user has a valid session cookie
    const supabaseAuthCookie = request.cookies.getAll().find(
      c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
    )

    // If no auth cookie or session was just cleared, redirect to login
    const clearedAuth = response.headers.getSetCookie().some(
      h => h.includes('sb-') && h.includes('Max-Age=0')
    )

    if (!supabaseAuthCookie || clearedAuth) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
