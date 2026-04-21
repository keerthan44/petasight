"use client"

import { useEffect, useRef, useState } from "react"
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
} from "firebase/auth"
import type { User } from "firebase/auth"
import { auth } from "@/lib/firebase-client"
import ChatInterface from "@/components/ChatInterface"

type AuthState = "init" | "unauthenticated" | "verifying" | "authorized" | "forbidden" | "error"
type FormMode = "signin" | "signup"

function mapFirebaseError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password."
    case "auth/email-already-in-use":
      return "An account with this email already exists."
    case "auth/weak-password":
      return "Password must be at least 6 characters."
    case "auth/invalid-email":
      return "Please enter a valid email address."
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later."
    default:
      return "Sign-in failed. Please try again."
  }
}

export default function AuthGate() {
  const [authState, setAuthState] = useState<AuthState>("init")
  const [formMode, setFormMode] = useState<FormMode>("signin")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const googleBtnRef = useRef<HTMLButtonElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthState((prev) =>
          prev === "forbidden" || prev === "error" ? prev : "unauthenticated"
        )
        setEmail("")
        setPassword("")
        setShowPassword(false)
        setErrorMsg("")
        return
      }
      await verify(user)
    })
    return unsubscribe
  }, [])

  async function verify(user: User) {
    setAuthState("verifying")
    setErrorMsg("")

    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        setAuthState("authorized")
        return
      }

      await auth.signOut()

      if (res.status === 403) {
        setAuthState("forbidden")
        setErrorMsg("Access restricted to @petasight.com accounts")
      } else {
        setAuthState("error")
        setErrorMsg("Sign-in failed. Please try again.")
      }
      requestAnimationFrame(() => errorRef.current?.focus())
    } catch {
      await auth.signOut().catch(() => {})
      setAuthState("error")
      setErrorMsg("Sign-in failed. Please try again.")
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally {
      setIsSubmitting(false)
      setIsGoogleLoading(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSubmitting || isGoogleLoading) return
    setIsSubmitting(true)
    setErrorMsg("")

    try {
      const result =
        formMode === "signin"
          ? await signInWithEmailAndPassword(auth, email, password)
          : await createUserWithEmailAndPassword(auth, email, password)
      await verify(result.user)
    } catch (err: unknown) {
      setIsSubmitting(false)
      const code = (err as { code?: string }).code ?? ""
      setErrorMsg(mapFirebaseError(code))
      requestAnimationFrame(() => errorRef.current?.focus())
    }
  }

  async function handleGoogle() {
    if (isSubmitting || isGoogleLoading) return
    setIsGoogleLoading(true)
    setErrorMsg("")

    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      await verify(result.user)
    } catch (err: unknown) {
      setIsGoogleLoading(false)
      const code = (err as { code?: string }).code
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        requestAnimationFrame(() => googleBtnRef.current?.focus())
        return
      }
      setErrorMsg("Sign-in failed. Please try again.")
      requestAnimationFrame(() => errorRef.current?.focus())
    }
  }

  function switchMode(mode: FormMode) {
    setFormMode(mode)
    setErrorMsg("")
    setPassword("")
    requestAnimationFrame(() => emailRef.current?.focus())
  }

  if (authState === "init") return null
  if (authState === "authorized") return <ChatInterface />

  const isBusy = isSubmitting || isGoogleLoading
  const emailId = "auth-email"
  const passwordId = "auth-password"
  const errorId = "auth-error"

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-[#080c18] text-slate-100">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-8 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="bg-[#0d1221] border border-white/[0.07] rounded-2xl px-8 py-10 shadow-2xl space-y-6">

            {/* Avatar + heading */}
            <div className="text-center space-y-3">
              <div
                aria-hidden="true"
                className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700 flex items-center justify-center text-white text-lg font-bold select-none shadow-lg"
                style={{ fontFamily: "'Noto Naskh Arabic', serif" }}
              >
                ابن
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-white">
                  {formMode === "signin" ? "Sign in to Ibn Sina" : "Create your account"}
                </h1>
                <p className="text-sm text-slate-400">
                  Access is limited to @petasight.com accounts
                </p>
              </div>
            </div>

            {/* Email / password form */}
            <form onSubmit={handleEmailSubmit} noValidate className="space-y-4">

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor={emailId} className="block text-sm text-slate-300 font-medium">
                  Email
                </label>
                <input
                  ref={emailRef}
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isBusy}
                  aria-describedby={errorId}
                  aria-invalid={!!errorMsg || undefined}
                  placeholder="you@petasight.com"
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.3] text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50 focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 transition-colors"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor={passwordId} className="block text-sm text-slate-300 font-medium">
                  Password
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? "text" : "password"}
                    autoComplete={formMode === "signin" ? "current-password" : "new-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isBusy}
                    aria-describedby={errorId}
                    aria-invalid={!!errorMsg || undefined}
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-white/[0.05] border border-white/[0.3] text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50 focus:outline-2 focus:outline-blue-500 focus:outline-offset-2 transition-colors"
                  />
                  {/* Show / hide password toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-controls={passwordId}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
                  >
                    {showPassword ? (
                      <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error live region */}
              <div
                ref={errorRef}
                id={errorId}
                role="alert"
                aria-atomic="true"
                tabIndex={-1}
                className="text-sm text-red-400 min-h-[1.25rem] focus:outline-none"
              >
                {errorMsg && (
                  <>
                    <span aria-hidden="true" className="mr-1">⚠</span>
                    {errorMsg}
                  </>
                )}
              </div>

              {/* Submit */}
              <button
                ref={submitBtnRef}
                type="submit"
                disabled={isBusy || !email.trim() || !password}
                aria-busy={isSubmitting || undefined}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-2"
              >
                {isSubmitting ? (
                  <>
                    <svg aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Verifying…
                  </>
                ) : (
                  formMode === "signin" ? "Sign in" : "Create account"
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="flex-1 h-px bg-white/[0.08]" />
              <span className="text-xs text-slate-500">or</span>
              <div className="flex-1 h-px bg-white/[0.08]" />
            </div>

            {/* Google SSO */}
            <button
              ref={googleBtnRef}
              type="button"
              onClick={handleGoogle}
              disabled={isBusy}
              aria-busy={isGoogleLoading || undefined}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed text-slate-100 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-2"
            >
              {isGoogleLoading ? (
                <>
                  <svg aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Verifying…
                </>
              ) : (
                <>
                  <svg aria-hidden="true" className="w-4 h-4 flex-none" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Mode toggle */}
            <p className="text-center text-sm text-slate-400">
              {formMode === "signin" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className="text-blue-400 hover:text-blue-300 font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 rounded"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="text-blue-400 hover:text-blue-300 font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 rounded"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>

          </div>
        </div>
      </main>
    </div>
  )
}
