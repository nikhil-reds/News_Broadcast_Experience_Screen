"use client";

import { useActionState, useState } from "react";
import { signInAction, type SignInState } from "@/app/actions/auth";
import Image from "next/image";

const initialState: SignInState = {};

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="flex min-h-screen bg-slate-50">
      {/* Left Pane - Branding */}
      <section className="relative hidden w-1/2 flex-col items-center justify-center bg-slate-950 p-10 lg:flex overflow-hidden">
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
      <section className="flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        <div className="w-full max-w-md space-y-8 rounded-2xl bg-slate-100 p-8 shadow-sm sm:p-10 border border-slate-200 relative">
          
          <div className="text-center">
            {/* Logo */}
            <div className="mb-8 flex justify-center">
              <div className="flex h-14 w-40 items-center justify-center rounded-xl bg-slate-950 p-3 shadow-lg">
                <div className="relative h-full w-full">
                  <Image 
                    src="/amagi-logo-white.svg" 
                    alt="Amagi Logo" 
                    fill 
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
            
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to your operator account
            </p>
          </div>

          <form action={action} className="space-y-5">
            <div className="space-y-1.5">
              <input
                id="email"
                name="email"
                type="text"
                autoComplete="email"
                required
                className="block w-full rounded-full border border-slate-200 bg-white px-6 py-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 shadow-sm"
                placeholder="Email or Username"
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="block w-full rounded-full border border-slate-200 bg-white px-6 py-4 pr-12 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 shadow-sm"
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
              <div className="pt-2 pl-4">
                <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            {state.error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-medium text-rose-800">
                  {state.error}
                </p>
              </div>
            ) : null}

            <div className="pt-4">
              <button
                type="submit"
                disabled={pending}
                className="group relative flex w-full items-center justify-center overflow-hidden rounded-full bg-blue-600 px-4 py-4 text-base font-medium text-white shadow-md transition-all hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-70 active:scale-[0.98]"
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
