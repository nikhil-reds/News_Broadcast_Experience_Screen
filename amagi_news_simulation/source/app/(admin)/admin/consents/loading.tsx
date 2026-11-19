import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTableSkeleton } from "@/components/admin/admin-table";

export default function ConsentsLoading() {
  return <div className="space-y-4"><AdminPageHeader title="Consents" description="Loading consent records…" /><AdminTableSkeleton columns={10} rows={8} /></div>;
}
