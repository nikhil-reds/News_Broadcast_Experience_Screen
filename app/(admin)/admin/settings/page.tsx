import { SettingsWorkspace } from "@/components/admin/settings/settings-workspace";

export default function AdminSettingsPage() {
  return <SettingsWorkspace email={process.env.ADMIN_EMAIL ?? "admin@amagi.local"} hasCustomPassword={Boolean(process.env.ADMIN_PASSWORD)} hasCustomSecret={Boolean(process.env.ADMIN_SESSION_SECRET)} />;
}
