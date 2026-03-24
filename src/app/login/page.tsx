'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const ALLOWED_EMAILS = [
  'lari_uk@gmail.com',
  'larixavieruk7@gmail.com',
  'gusampteam@hotmail.com',
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (error === 'expired') {
      setMessage({ text: 'Your sign-in link has expired. Please request a new one.', type: 'error' })
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const normalised = email.trim().toLowerCase()

    if (!ALLOWED_EMAILS.includes(normalised)) {
      setMessage({ text: 'This email is not authorised to access the dashboard.', type: 'error' })
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalised,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setMessage({ text: error.message, type: 'error' })
      } else {
        setOtpSent(true)
        setMessage(null)
      }
    } catch {
      setMessage({ text: 'An unexpected error occurred.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: 'email',
      })

      if (error) {
        setMessage({ text: error.message, type: 'error' })
        setLoading(false)
        return
      }

      window.location.href = '/'
    } catch {
      setMessage({ text: 'An unexpected error occurred.', type: 'error' })
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--background)' }}>
      {/* Subtle radial glow behind the card */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
        />
      </div>

      <div
        className="relative w-full max-w-sm rounded-2xl p-8 border"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--card-border)',
          boxShadow: '0 0 80px rgba(99, 102, 241, 0.04)',
        }}
      >
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 text-white font-bold text-lg"
            style={{ background: 'var(--accent)' }}
          >
            S
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
            Savings Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Household finance tracker
          </p>
        </div>

        {otpSent ? (
          /* ── OTP code entry ── */
          <form onSubmit={handleOtpVerify} className="space-y-5">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              We sent a code to{' '}
              <strong style={{ color: 'var(--foreground)' }}>{email}</strong>.
              <br />
              Enter it below, or click the magic link in the email.
            </p>

            <div>
              <label htmlFor="otp" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                Sign-in code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                placeholder="000000"
                className="w-full px-4 py-3 rounded-lg text-center text-2xl tracking-[0.25em] font-mono outline-none transition-all border focus:ring-2"
                style={{
                  background: 'var(--background)',
                  borderColor: 'var(--card-border)',
                  color: 'var(--foreground)',
                  // @ts-expect-error CSS custom properties
                  '--tw-ring-color': 'var(--accent)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full py-3 rounded-lg font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'var(--accent)' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
              {loading ? 'Verifying...' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setOtpSent(false); setOtpCode(''); setMessage(null) }}
              className="w-full text-sm transition-colors cursor-pointer"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
            >
              Use a different email
            </button>
          </form>
        ) : (
          /* ── Email entry ── */
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-lg outline-none transition-all border focus:ring-2"
                style={{
                  background: 'var(--background)',
                  borderColor: 'var(--card-border)',
                  color: 'var(--foreground)',
                  // @ts-expect-error CSS custom properties
                  '--tw-ring-color': 'var(--accent)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'var(--accent)' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
              {loading ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        )}

        {/* Messages */}
        {message && (
          <div
            className="mt-4 p-3 rounded-lg text-sm border"
            style={{
              background: message.type === 'error'
                ? 'rgba(239, 68, 68, 0.08)'
                : 'rgba(34, 197, 94, 0.08)',
              borderColor: message.type === 'error'
                ? 'rgba(239, 68, 68, 0.2)'
                : 'rgba(34, 197, 94, 0.2)',
              color: message.type === 'error'
                ? 'var(--danger)'
                : 'var(--success)',
            }}
          >
            {message.text}
          </div>
        )}

        <p className="text-center text-xs mt-6" style={{ color: 'var(--card-border)' }}>
          Access restricted to authorised family members
        </p>
      </div>
    </div>
  )
}
