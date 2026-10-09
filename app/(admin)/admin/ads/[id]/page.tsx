import { notFound } from "next/navigation";
import { deleteAdCampaignAction, toggleAdCampaignAction } from "@/app/actions/admin-ads";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection, DetailGrid, DetailItem } from "@/components/admin/admin-section";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
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
      <AdminPageHeader
        backHref="/admin/ads"
        backLabel="Back to ads"
        title={ad.sponsor}
        description={ad.text}
      />

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

      <AdminSection title="Actions" description="Enabling or disabling changes what the ad screens show.">
        <div className="flex flex-wrap gap-3">
          <form action={toggleAdCampaignAction}>
            <input type="hidden" name="id" value={ad.id} />
            <input type="hidden" name="isActive" value={String(ad.isActive)} />
            <ConfirmSubmitButton
              message={`${ad.isActive ? "Disable" : "Enable"} the "${ad.sponsor}" campaign?`}
              className="rounded-md bg-admin-primary px-4 py-2 text-sm font-bold text-admin-on-primary hover:bg-admin-primary-hover"
            >
              {ad.isActive ? "Disable campaign" : "Enable campaign"}
            </ConfirmSubmitButton>
          </form>
        </div>
      </AdminSection>

      <AdminSection title="Danger zone" description="Deleting a campaign cannot be undone.">
        <form action={deleteAdCampaignAction}>
          <input type="hidden" name="id" value={ad.id} />
          <ConfirmSubmitButton
            message={`Permanently delete the "${ad.sponsor}" campaign? This cannot be undone.`}
            className="rounded-md border border-status-danger-border bg-status-danger-bg px-4 py-2 text-sm font-bold text-status-danger-text hover:bg-status-danger-bg"
          >
            Delete campaign
          </ConfirmSubmitButton>
        </form>
      </AdminSection>
    </div>
  );
}
