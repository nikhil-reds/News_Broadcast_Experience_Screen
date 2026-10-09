export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded bg-admin-border" />
      <div className="h-4 w-80 max-w-full rounded bg-admin-border" />
      <div className="h-64 rounded-lg border border-admin-border bg-admin-surface" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
