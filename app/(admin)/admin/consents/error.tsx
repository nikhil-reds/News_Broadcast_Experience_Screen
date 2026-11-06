"use client";

export default function ConsentsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-admin-text"><h1 className="admin-title">Consents unavailable</h1><p className="mt-2 text-sm text-admin-text-muted">Consent records could not be loaded. Check the database connection and try again.</p><button type="button" className="admin-action mt-5" onClick={reset}>Try again</button></div>;
}
