import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BroadcastOutputList, ScreenList } from "@/components/admin/screen-list";

export default function AdminScreenListPage() {
  return (
    <div className="mx-auto w-full max-w-[112rem] space-y-5 sm:space-y-6">
      <AdminPageHeader title="Screen List" description="Seven responsive broadcast URLs and all 12 workflow screens in one place." />
      <BroadcastOutputList />
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-admin-text">Workflow Screens</h2>
          <p className="mt-1 text-sm text-admin-text-muted">Open any of the 12 workflow screens.</p>
        </div>
        <ScreenList />
      </section>
    </div>
  );
}
