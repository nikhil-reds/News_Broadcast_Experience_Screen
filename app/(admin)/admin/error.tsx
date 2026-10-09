"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-status-danger-border bg-admin-surface p-6 shadow-sm">
      <h2 className="text-lg font-bold text-admin-text">This page could not be loaded</h2>
      <p className="mt-1 text-sm text-admin-text-muted">
        The data request failed. Try again, and if it keeps happening check the server logs.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-admin-primary px-4 py-2 text-sm font-semibold text-admin-on-primary hover:bg-admin-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}
