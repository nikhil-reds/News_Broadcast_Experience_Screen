import "server-only";

import { cookies } from "next/headers";

export const ADMIN_THEME_COOKIE = "admin-theme";
export const ADMIN_THEMES = ["light", "dark", "system"] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isAdminTheme(value: unknown): value is AdminTheme {
  return typeof value === "string" && (ADMIN_THEMES as readonly string[]).includes(value);
}

export async function getAdminTheme(): Promise<AdminTheme> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_THEME_COOKIE)?.value;
  return isAdminTheme(value) ? value : "system";
}

export async function setAdminThemeCookie(theme: AdminTheme) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
