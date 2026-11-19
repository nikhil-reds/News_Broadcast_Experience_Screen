import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTableSkeleton } from "@/components/admin/admin-table";

export default function FeedbackLoading() {
  return <div className="space-y-4"><AdminPageHeader title="Feedback" description="Loading feedback…" /><AdminTableSkeleton columns={7} rows={8} /></div>;
}
