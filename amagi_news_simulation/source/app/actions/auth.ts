"use server";

import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession } from "@/lib/session";
import { validateAdminCredentials } from "@/lib/auth";

export type SignInState = {
  error?: string;
};

export async function signInAction(
  _state: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both email and password." };
  }

  const identity = await validateAdminCredentials(email, password);
  if (!identity) {
    return { error: "Invalid admin credentials." };
  }

  await createAdminSession(identity.email, identity.userId);
  redirect("/admin");
}

export async function signOutAction() {
  await clearAdminSession();
  redirect("/signin");
}
