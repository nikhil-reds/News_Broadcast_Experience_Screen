import { redirect } from "next/navigation";

export default async function AdminGenerationTasksRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  redirect(`/admin/generation-logs${query}`);
}
