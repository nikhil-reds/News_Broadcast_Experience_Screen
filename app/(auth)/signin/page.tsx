"use client";

import { useActionState, useState } from "react";
import { signInAction, type SignInState } from "@/app/actions/auth";
import Image from "next/image";

const initialState: SignInState = {};

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="signin-page experience-gradient flex min-h-screen">
      {/* Left Pane - Branding */}
      <section className="relative hidden w-1/2 flex-col items-center justify-center bg-slate-950/35 p-10 lg:flex overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute -left-[20%] -top-[10%] h-[50%] w-[50%] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute -bottom-[20%] -right-[10%] h-[60%] w-[60%] rounded-full bg-purple-600/10 blur-[120px]"></div>
        
        <div className="z-10 flex flex-col items-center text-center max-w-lg">
          <div className="relative h-28 w-72 mb-10">
             <Image 
                src="/amagi-logo-white.svg" 
                alt="Amagi Logo" 
                fill 
                className="object-contain drop-shadow-lg"
                priority 
             />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-white mb-6">
            Broadcast Control Center
          </h2>
          <p className="text-lg text-slate-300 leading-relaxed">
            Experience next-generation news broadcasting. Manage your live streams, dynamic graphics, and operator sessions with unparalleled precision.
          </p>
        </div>
        
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none"></div>
      </section>

      {/* Right Pane - Login Form */}
      <section className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-4 py-8 sm:px-8 sm:py-12 lg:w-1/2 lg:px-12 lg:py-16">
        <div className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/95 p-6 shadow-[0_24px_80px_rgba(8,12,40,0.28),0_8px_24px_rgba(8,12,40,0.12)] backdrop-blur-xl sm:rounded-[2rem] sm:p-10">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/80 to-transparent sm:inset-x-10" />
          
          <div className="text-center">
            <div className="mb-7 flex justify-center sm:mb-8">
              <div className="flex h-14 w-40 items-center justify-center rounded-2xl bg-slate-950 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.2)] ring-1 ring-slate-900/10 sm:h-16 sm:w-44 sm:p-3.5">
                <div className="relative h-full w-full">
                  <Image
                    src="/amagi-logo-white.svg"
                    alt="Amagi Logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </div>
            </div>
            
            <h1 className="text-[1.4rem] font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in to your operator account
            </p>
          </div>

          <form action={action} className="mt-7 space-y-4 sm:mt-8 sm:space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="sr-only">Email or username</label>
              <input
                id="email"
                name="email"
                type="text"
                autoComplete="email"
                required
                className="block w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] sm:px-5 sm:py-4"
                placeholder="Email or Username"
              />
            </div>
            
            <div className="space-y-1.5">
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="block w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3.5 pr-12 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] sm:px-5 sm:py-4"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {state.error ? (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-800">
                  {state.error}
                </p>
              </div>
            ) : null}

            <div className="pt-2 sm:pt-4">
              <button
                type="submit"
                disabled={pending}
                className="group relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-4 py-3.5 text-base font-medium text-white shadow-[0_12px_24px_rgba(79,70,229,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(79,70,229,0.34)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-70 active:translate-y-0 active:scale-[0.98] sm:py-4"
              >
                {pending ? (
                  <>
                    <svg className="mr-2 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                      <polyline points="10 17 15 12 10 7"></polyline>
                      <line x1="15" y1="12" x2="3" y2="12"></line>
                    </svg>
                    Sign In
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
