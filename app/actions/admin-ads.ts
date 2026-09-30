"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requiredText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createAdCampaignAction(formData: FormData) {
  await verifyAdminSession();

  const sponsor = requiredText(formData, "sponsor");
  const text = requiredText(formData, "text");
  const code = requiredText(formData, "code");
  const endTime = requiredText(formData, "endTime");
  const priority = Number(formData.get("priority") ?? 5);

  if (!sponsor || !text || !code || !endTime) {
    redirect("/admin/ads?error=missing-fields");
  }

  await prisma.adCampaign.create({
    data: {
      sponsor,
      text,
      code,
      priority: Number.isFinite(priority) ? priority : 5,
      startTime: new Date(requiredText(formData, "startTime") || Date.now()),
      endTime: new Date(endTime),
      isActive: formData.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/ads");
  redirect("/admin/ads");
}

export async function toggleAdCampaignAction(formData: FormData) {
  await verifyAdminSession();
  const id = requiredText(formData, "id");
  const isActive = requiredText(formData, "isActive") === "true";

  await prisma.adCampaign.update({
    where: { id },
    data: { isActive: !isActive },
  });

  revalidatePath("/admin/ads");
}

export async function deleteAdCampaignAction(formData: FormData) {
  await verifyAdminSession();
  const id = requiredText(formData, "id");

  await prisma.adCampaign.delete({ where: { id } });
  revalidatePath("/admin/ads");
  redirect("/admin/ads");
}
