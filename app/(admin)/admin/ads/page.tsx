import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { createAdCampaignAction, toggleAdCampaignAction } from "@/app/actions/admin-ads";
import { formatDate } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminAdsPage() {
  const ads = await prisma.adCampaign.findMany({
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Ads</h2>
        <p className="text-sm text-slate-500">Sponsored campaigns used by the ad showcase screens.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold">Create Campaign</h3>
        <form action={createAdCampaignAction} className="mt-4 grid gap-3 lg:grid-cols-6">
          <input name="sponsor" required placeholder="Sponsor" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="code" required placeholder="Code" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="text" required placeholder="Campaign text" className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2" />
          <input name="priority" type="number" defaultValue={5} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="endTime" type="datetime-local" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
            Active
          </label>
          <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 lg:col-span-5">
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
              <span className="inline-block max-w-xs truncate align-bottom">{ad.text}</span>
            </Td>
            <Td>{formatDate(ad.startTime)}</Td>
            <Td>{formatDate(ad.endTime)}</Td>
            <Td>
              <div className="flex items-center gap-2">
                <a href={`/admin/ads/${ad.id}`} className="font-semibold text-blue-700">
                  Details
                </a>
                <form action={toggleAdCampaignAction}>
                  <input type="hidden" name="id" value={ad.id} />
                  <input type="hidden" name="isActive" value={String(ad.isActive)} />
                  <button className="font-semibold text-slate-700">
                    {ad.isActive ? "Disable" : "Enable"}
                  </button>
                </form>
              </div>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
