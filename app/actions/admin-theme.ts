"use server";

import { revalidatePath } from "next/cache";
import { isAdminTheme, setAdminThemeCookie } from "@/lib/admin-theme";
import { verifyAdminSession } from "@/lib/auth";

export async function setAdminThemeAction(formData: FormData) {
  await verifyAdminSession();

  const theme = String(formData.get("theme") ?? "");
  if (!isAdminTheme(theme)) return;

  await setAdminThemeCookie(theme);
  revalidatePath("/admin", "layout");
}
