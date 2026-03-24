import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'

const CSRF_TOKEN_LENGTH = 32
const CSRF_COOKIE_NAME = 'savings_csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generates a CSRF token and sets it as an httpOnly cookie
 */
export async function generateCSRFToken(): Promise<string> {
  const token = randomBytes(CSRF_TOKEN_LENGTH).toString('hex')
  const cookieStore = await cookies()

  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1 hour
    path: '/',
  })

  return token
}

/**
 * Validates CSRF token from request header against cookie
 */
export async function validateCSRFToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken) return false

  const cookieBuffer = Buffer.from(cookieToken)
  const headerBuffer = Buffer.from(headerToken)

  if (cookieBuffer.length !== headerBuffer.length) return false

  const crypto = await import('crypto')
  try {
    return crypto.timingSafeEqual(cookieBuffer, headerBuffer)
  } catch {
    return false
  }
}

/**
 * Middleware helper to enforce CSRF protection on state-changing methods
 */
export async function requireCSRFToken(request: Request): Promise<Response | null> {
  const method = request.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null

  const isValid = await validateCSRFToken(request)
  if (!isValid) {
    return Response.json({ error: 'Invalid or missing CSRF token' }, { status: 403 })
  }

  return null
}
