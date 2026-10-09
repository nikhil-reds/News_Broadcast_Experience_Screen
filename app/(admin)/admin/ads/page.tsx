import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { createAdCampaignAction, toggleAdCampaignAction } from "@/app/actions/admin-ads";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

const inputClass =
  "mt-1 w-full rounded-md border border-admin-input px-3 py-2 text-sm focus:border-admin-focus focus:outline-none focus:ring-2 focus:ring-admin-focus/30 bg-admin-surface text-admin-text";

export default async function AdminAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ads = await prisma.adCampaign.findMany({
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div className="space-y-4">
      <AdminPageHeader title="Ads" description="Sponsored campaigns used by the ad showcase screens." />

      <section className="rounded-lg border border-admin-border bg-admin-surface p-5 shadow-sm">
        <h3 className="font-bold">Create Campaign</h3>
        {error === "missing-fields" ? (
          <p role="alert" className="mt-3 rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
            Sponsor, code, campaign text and end time are required.
          </p>
        ) : null}
        <form action={createAdCampaignAction} className="mt-4 grid gap-4 lg:grid-cols-6">
          <label className="text-sm font-semibold text-admin-text-secondary">
            Sponsor
            <input name="sponsor" required className={inputClass} />
          </label>
          <label className="text-sm font-semibold text-admin-text-secondary">
            Code
            <input name="code" required className={inputClass} />
          </label>
          <label className="text-sm font-semibold text-admin-text-secondary lg:col-span-2">
            Campaign text
            <input name="text" required className={inputClass} />
          </label>
          <label className="text-sm font-semibold text-admin-text-secondary">
            Priority
            <input name="priority" type="number" defaultValue={5} className={inputClass} />
          </label>
          <label className="text-sm font-semibold text-admin-text-secondary">
            End time
            <input name="endTime" type="datetime-local" required className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-admin-text-secondary">
            <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
            Active
          </label>
          <button className="rounded-md bg-admin-primary px-4 py-2 text-sm font-bold text-admin-on-primary hover:bg-admin-primary-hover lg:col-span-6 lg:justify-self-start">
            Add campaign
          </button>
        </form>
      </section>

      <AdminTable headers={["Sponsor", "Code", "Status", "Priority", "Impressions", "Text", "Start", "End", "Actions"]} empty={ads.length === 0}>
        {ads.map((ad) => (
          <tr key={ad.id}>
            <Td>{ad.sponsor}</Td>
            <Td>{ad.code}</Td>
            <Td><StatusBadge value={ad.isActive ? "active" : "inactive"} /></Td>
            <Td>{ad.priority}</Td>
            <Td>{ad.impressions}</Td>
            <Td>
              <span className="inline-block max-w-xs truncate align-bottom" title={ad.text}>{ad.text}</span>
            </Td>
            <Td>{formatDate(ad.startTime)}</Td>
            <Td>{formatDate(ad.endTime)}</Td>
            <Td>
              <div className="flex items-center gap-3">
                <a href={`/admin/ads/${ad.id}`} className="font-semibold text-admin-accent hover:underline">
                  Details
                </a>
                <form action={toggleAdCampaignAction}>
                  <input type="hidden" name="id" value={ad.id} />
                  <input type="hidden" name="isActive" value={String(ad.isActive)} />
                  <ConfirmSubmitButton
                    message={`${ad.isActive ? "Disable" : "Enable"} the "${ad.sponsor}" campaign?`}
                    className="font-semibold text-admin-text-secondary hover:underline"
                  >
                    {ad.isActive ? "Disable" : "Enable"}
                  </ConfirmSubmitButton>
                </form>
              </div>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
