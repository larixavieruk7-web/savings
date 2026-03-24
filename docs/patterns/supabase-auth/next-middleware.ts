import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from './src/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Skip session refresh for auth callback
  if (request.nextUrl.pathname === '/auth/callback') {
    return NextResponse.next()
  }

  // Refresh Supabase session on every request
  const response = await updateSession(request)

  // Protect all routes except /login and /auth/*
  const isPublicRoute = request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth/')

  if (!isPublicRoute) {
    // Check if user has a valid session
    const supabaseAuthCookie = request.cookies.getAll().find(
      c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
    )

    // If no auth cookie and the response didn't just clear cookies, redirect to login
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
