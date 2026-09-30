import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAdCampaignAction, toggleAdCampaignAction } from "@/app/actions/admin-ads";
import { AdminSection, DetailGrid, DetailItem } from "@/components/admin/admin-section";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminAdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ad = await prisma.adCampaign.findUnique({ where: { id } });
  if (!ad) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ads" className="text-sm font-semibold text-blue-700">Back to ads</Link>
        <h2 className="mt-2 text-2xl font-bold">{ad.sponsor}</h2>
        <p className="text-sm text-slate-500">{ad.text}</p>
      </div>

      <AdminSection title="Campaign Details">
        <DetailGrid>
          <DetailItem label="Code" value={ad.code} />
          <DetailItem label="Status" value={<StatusBadge value={ad.isActive ? "active" : "inactive"} />} />
          <DetailItem label="Priority" value={ad.priority} />
          <DetailItem label="Impressions" value={ad.impressions} />
          <DetailItem label="Start" value={formatDate(ad.startTime)} />
          <DetailItem label="End" value={formatDate(ad.endTime)} />
          <DetailItem label="Created" value={formatDate(ad.createdAt)} />
          <DetailItem label="Updated" value={formatDate(ad.updatedAt)} />
          <DetailItem label="Campaign ID" value={ad.id} />
        </DetailGrid>
      </AdminSection>

      <AdminSection title="Actions">
        <div className="flex flex-wrap gap-3">
          <form action={toggleAdCampaignAction}>
            <input type="hidden" name="id" value={ad.id} />
            <input type="hidden" name="isActive" value={String(ad.isActive)} />
            <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">
              {ad.isActive ? "Disable campaign" : "Enable campaign"}
            </button>
          </form>
          <form action={deleteAdCampaignAction}>
            <input type="hidden" name="id" value={ad.id} />
            <button className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">
              Delete campaign
            </button>
          </form>
        </div>
      </AdminSection>
    </div>
  );
}
