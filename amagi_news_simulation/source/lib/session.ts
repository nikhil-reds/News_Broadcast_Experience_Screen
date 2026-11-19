import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/rbac";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

type StoredAdminSession = {
  email: string;
  userId: string | null;
  expiresAt: number;
};
export type AdminSession = StoredAdminSession & { roleId: string | null; roleSlug: string; roleName: string; permissions: string[]; isEnvironmentAdmin: boolean };

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? "local-dev-admin-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function encodeSession(session: StoredAdminSession) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token?: string): StoredAdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredAdminSession;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createAdminSession(email: string, userId: string | null) {
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    encodeSession({
      email,
      userId,
      expiresAt: Date.now() + MAX_AGE_SECONDS * 1000,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    }
  );
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const stored = decodeSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!stored) return null;
  const environmentEmail = (process.env.ADMIN_EMAIL ?? "admin@amagi.local").toLowerCase();
  if (stored.email.toLowerCase() === environmentEmail) return { ...stored, roleId: null, roleSlug: "super-admin", roleName: "Super Admin", permissions: [...PERMISSIONS], isEnvironmentAdmin: true };
  if (!stored.userId) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: stored.userId }, include: { role: true } });
  if (!user || user.status !== "active" || !user.role) return null;
  return { ...stored, email: user.email, roleId: user.role.id, roleSlug: user.role.slug, roleName: user.role.name, permissions: user.role.permissions, isEnvironmentAdmin: false };
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
