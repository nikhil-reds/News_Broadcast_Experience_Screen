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

  if (!validateAdminCredentials(email, password)) {
    return { error: "Invalid admin credentials." };
  }

  await createAdminSession(email);
  redirect("/admin");
}

export async function signOutAction() {
  await clearAdminSession();
  redirect("/signin");
}
