"use client";

export interface CurrentSession {
  id: string;
  status: string;
  selectedBackgroundId: string | null;
  selectedSubtitleLanguage: string;
  startedAt: string;
  endedAt: string | null;
}

/** GET /api/sessions/current, used by Screens 7/8/11/12 to resolve "now". */
export async function fetchCurrentSession(): Promise<CurrentSession | null> {
  try {
    const res = await fetch("/api/sessions/current");
    if (!res.ok) return null;
    const data = await res.json();
    return data.session ?? null;
  } catch {
    return null;
  }
}

/** PATCH one field (or a few) on a session — Screen 7's background pick, Screen 8's language pick. */
export async function patchSession(
  sessionId: string,
  patch: Partial<Pick<CurrentSession, "selectedBackgroundId" | "selectedSubtitleLanguage" | "status">>
): Promise<void> {
  try {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    console.error("Failed to update session:", err);
  }
}
