import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminUserInput = { name: string; email: string; password: string };
export type AdminUserFieldErrors = Partial<Record<keyof AdminUserInput, string>>;

export function validateAdminUserInput(value: unknown): { data?: AdminUserInput; errors?: AdminUserFieldErrors } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const errors: AdminUserFieldErrors = {};
  if (name.length < 2 || name.length > 100) errors.name = "Enter a name between 2 and 100 characters.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 12 || password.length > 128) errors.password = "Use a password between 12 and 128 characters.";
  if (Object.keys(errors).length) return { errors };
  return { data: { name, email, password } };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
