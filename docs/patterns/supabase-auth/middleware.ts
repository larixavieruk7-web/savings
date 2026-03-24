import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { error } = await supabase.auth.getUser()

  if (error) {
    // Clear stale session cookies but preserve code_verifier (needed for PKCE)
    const cookieNames = request.cookies.getAll()
      .filter(c => c.name.startsWith('sb-') && !c.name.includes('code-verifier'))
      .map(c => c.name)

    if (cookieNames.length > 0) {
      supabaseResponse = NextResponse.next({ request })
      for (const name of cookieNames) {
        supabaseResponse.cookies.delete(name)
      }
    }
  }

  return supabaseResponse
}
