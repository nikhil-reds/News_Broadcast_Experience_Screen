import { AdminCard } from "@/components/admin/admin-card";

export default function AdminSettingsPage() {
  const email = process.env.ADMIN_EMAIL ?? "admin@amagi.local";
  const hasCustomPassword = Boolean(process.env.ADMIN_PASSWORD);
  const hasCustomSecret = Boolean(process.env.ADMIN_SESSION_SECRET);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-slate-500">Current admin configuration and defaults.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard title="Admin Email" value={email} detail="Configured sign-in identity" />
        <AdminCard
          title="Password"
          value={hasCustomPassword ? "Configured" : "Dev default"}
          detail="Set ADMIN_PASSWORD for production"
          tone={hasCustomPassword ? "good" : "warn"}
        />
        <AdminCard
          title="Session Secret"
          value={hasCustomSecret ? "Configured" : "Dev default"}
          detail="Set ADMIN_SESSION_SECRET for production"
          tone={hasCustomSecret ? "good" : "warn"}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">Recommended Environment</h3>
        <div className="mt-4 space-y-2 rounded-md bg-slate-950 p-4 font-mono text-sm text-slate-100">
          <p>ADMIN_EMAIL=admin@example.com</p>
          <p>ADMIN_PASSWORD=replace-with-a-strong-password</p>
          <p>ADMIN_SESSION_SECRET=replace-with-a-long-random-secret</p>
        </div>
      </section>
    </div>
  );
}
