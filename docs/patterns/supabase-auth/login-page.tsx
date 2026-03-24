'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const supabase = createClient()

  // Check for error param (e.g. expired magic link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (error === 'expired') {
      setMessage('Your sign-in link has expired. Please request a new one.')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setMessage('Error: ' + error.message)
      } else {
        setOtpSent(true)
        setMessage('')
      }
    } catch (error) {
      console.error('Login error:', error)
      setMessage('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode.trim(),
        type: 'email',
      })

      if (error) {
        setMessage('Error: ' + error.message)
        setLoading(false)
        return
      }

      // Session established — redirect to dashboard
      window.location.href = '/'
    } catch (error) {
      console.error('OTP verify error:', error)
      setMessage('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-2xl">S</span>
          </div>
          <span className="text-2xl font-bold text-slate-900 dark:text-gray-100">Savings Dashboard</span>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 text-slate-900 dark:text-gray-100">Welcome back</h1>
        <p className="text-center text-slate-600 dark:text-gray-300 mb-8">Sign in to your account</p>

        {otpSent ? (
          <form onSubmit={handleOtpVerify} className="space-y-6">
            <div>
              <p className="text-sm text-slate-600 dark:text-gray-300 mb-4">
                We sent a sign-in code to <strong className="text-slate-900 dark:text-gray-100">{email}</strong>. Enter the code below, or click the magic link in the email.
              </p>
              <label htmlFor="otp" className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-2">
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
                placeholder="00000000"
                className="w-full px-4 py-3 border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all text-slate-900 dark:text-gray-100 bg-white dark:bg-gray-800 text-center text-2xl tracking-[0.2em] font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {loading ? 'Verifying...' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setOtpSent(false); setOtpCode(''); setMessage('') }}
              className="w-full text-sm text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Back to email
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-gray-200 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all text-slate-900 dark:text-gray-100 bg-white dark:bg-gray-800"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {loading ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        )}

        {message && (
          <div className={`mt-4 p-4 rounded-lg ${message.includes('Error') || message.includes('expired') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'}`}>
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
