"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { signInAction, type SignInState } from "@/app/actions/auth";
import { abroSans } from "@/lib/abro-sans";
import { poppins } from "@/lib/poppins";
import styles from "./signin.module.css";

const initialState: SignInState = {};

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className={`${poppins.className} ${styles.page}`}>
      <div className={styles.shell}>
        <section className={styles.brandPanel} aria-labelledby="signin-title">
          <div className={styles.brandContent}>
            <Image src="/amagi-logo-white.svg" alt="Amagi" width={160} height={54} className={styles.logo} priority />
            <h1 id="signin-title" className={`${abroSans.className} ${styles.title}`}>
              Broadcast<br /><span className={styles.titleLine}>Control Center</span>
            </h1>
            <p className={styles.intro}>Run live streams, graphics, ads and operator sessions from one place.</p>
            <div className={styles.systemStatus} role="status"><span aria-hidden="true" />All systems normal</div>
          </div>
          <p className={styles.securityNote}>Authorised operators only. Sessions are logged.</p>
        </section>

        <section className={styles.formPanel} aria-label="Operator sign in">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Welcome back</h2>
              <p>Sign in to your operator account</p>
            </div>

            <form action={action} className={styles.form}>
              <div>
                <label htmlFor="email" className="sr-only">Work email</label>
                <input id="email" name="email" type="email" autoComplete="email" required placeholder="Work email" className={styles.input} />
              </div>

              <div className={styles.passwordField}>
                <label htmlFor="password" className="sr-only">Password</label>
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Password" className={styles.input} />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.1 3.3M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>

              <label className={styles.remember}><input type="checkbox" name="remember" defaultChecked /><span>Keep me signed in</span></label>
              {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}

              <button type="submit" disabled={pending} className={styles.submitButton}>
                <span>{pending ? "Signing in…" : "Sign in"}</span>
                <span className={styles.arrow} aria-hidden="true">
                  {pending ? <span className={styles.spinner} /> : <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>}
                </span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
