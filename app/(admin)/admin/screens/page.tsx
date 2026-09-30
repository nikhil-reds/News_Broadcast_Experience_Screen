import Link from "next/link";
import { AdminTable, Td } from "@/components/admin/admin-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { shortId } from "@/lib/admin-format";
import { prisma } from "@/lib/prisma";

export default async function AdminScreensPage() {
  const screens = await prisma.screenPublication.findMany({
    orderBy: { screenId: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Screens</h2>
        <p className="text-sm text-slate-500">Publication state for screen outputs.</p>
      </div>
      <AdminTable
        headers={["Screen", "Current Generation", "Pending Generation", "Pending Status", "Failure", "Open"]}
        empty={screens.length === 0}
      >
        {screens.map((screen) => (
          <tr key={screen.id}>
            <Td>Screen {screen.screenId}</Td>
            <Td>{shortId(screen.currentGenerationId)}</Td>
            <Td>{shortId(screen.pendingGenerationId)}</Td>
            <Td><StatusBadge value={screen.pendingStatus} /></Td>
            <Td>{screen.pendingFailureReason ?? "None"}</Td>
            <Td>
              <Link href={`/screen${screen.screenId}`} className="font-semibold text-blue-700">
                Open
              </Link>
            </Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
