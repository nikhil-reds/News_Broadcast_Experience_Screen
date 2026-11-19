import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BroadcastOutputList, ScreenList } from "@/components/admin/screen-list";
import { prisma } from "@/lib/prisma";

export default async function AdminScreenListPage() {
  const publications = await prisma.screenPublication.findMany({
    orderBy: { screenId: "asc" },
    select: {
      screenId: true,
      currentGenerationId: true,
      pendingStatus: true,
      pendingFailureReason: true,
      updatedAt: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-[112rem] space-y-5 sm:space-y-6">
      <AdminPageHeader title="Screen List" description="Six device-size broadcast URLs and all 12 workflow screens in one place." />
      <BroadcastOutputList />
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-admin-text">Workflow Screens</h2>
          <p className="mt-1 text-sm text-admin-text-muted">Publication status for Screens 1–12.</p>
        </div>
        <ScreenList publications={publications} />
      </section>
    </div>
  );
}
