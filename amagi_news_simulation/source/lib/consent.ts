export const CONSENT_TYPES = ["all", "recording", "broadcast", "voice-cloning", "translation", "promotional-use", "other"] as const;
export const CONSENT_STATUSES = ["pending", "granted", "declined", "withdrawn", "expired"] as const;
export const CONSENT_EXPIRY_PRESETS = ["24-hours", "7-days", "30-days"] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export type ConsentExpiryPreset = (typeof CONSENT_EXPIRY_PRESETS)[number];

export const CONSENT_TRANSITIONS: Record<ConsentStatus, readonly ConsentStatus[]> = {
  pending: ["granted", "declined"],
  granted: ["withdrawn", "expired"],
  declined: [],
  withdrawn: [],
  expired: [],
};

export type ConsentInput = {
  participantName: string;
  participantEmail: string | null;
  consentType: ConsentType;
  scope: string;
  status: ConsentStatus;
  notes: string | null;
  grantedAt: Date | null;
  expiresAt: Date | null;
};

export type ConsentFieldErrors = Partial<Record<keyof ConsentInput | "expiryPreset" | "effectiveAt" | "note", string>>;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatConsentLabel(value: string) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function validateConsentInput(value: unknown): { data?: ConsentInput; errors?: ConsentFieldErrors } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const participantName = optionalText(input.participantName) ?? "";
  const participantEmail = optionalText(input.participantEmail)?.toLowerCase() ?? null;
  const consentType = typeof input.consentType === "string" ? input.consentType : "";
  const scope = optionalText(input.scope) ?? "";
  const status = typeof input.status === "string" ? input.status : "pending";
  const notes = optionalText(input.notes);
  const grantedAt = optionalDate(input.grantedAt);
  const expiryPreset = typeof input.expiryPreset === "string" ? input.expiryPreset : "24-hours";
  const errors: ConsentFieldErrors = {};

  if (!participantName || participantName.length > 100) errors.participantName = "Enter a participant name between 1 and 100 characters.";
  if (participantEmail && (participantEmail.length > 254 || !EMAIL_PATTERN.test(participantEmail))) errors.participantEmail = "Enter a valid email address.";
  if (!CONSENT_TYPES.includes(consentType as ConsentType)) errors.consentType = "Select a valid consent type.";
  if (scope.length < 10 || scope.length > 5000) errors.scope = "Enter a scope between 10 and 5,000 characters.";
  if (!CONSENT_STATUSES.includes(status as ConsentStatus) || !["pending", "granted", "declined"].includes(status)) errors.status = "New consent must be pending, granted, or declined.";
  if (notes && notes.length > 5000) errors.notes = "Notes cannot exceed 5,000 characters.";
  if (grantedAt === undefined) errors.grantedAt = "Enter a valid granted date.";
  if (!CONSENT_EXPIRY_PRESETS.includes(expiryPreset as ConsentExpiryPreset)) errors.expiryPreset = "Select a valid expiry period.";
  if (status === "granted" && !grantedAt) errors.grantedAt = "Granted date is required for granted consent.";
  if (status !== "granted" && grantedAt) errors.grantedAt = "Granted date is only valid when consent is granted.";
  if (Object.keys(errors).length) return { errors };

  const expiryDurations: Record<ConsentExpiryPreset, number> = {
    "24-hours": 24 * 60 * 60 * 1000,
    "7-days": 7 * 24 * 60 * 60 * 1000,
    "30-days": 30 * 24 * 60 * 60 * 1000,
  };
  const expiresAt = new Date((grantedAt ?? new Date()).getTime() + expiryDurations[expiryPreset as ConsentExpiryPreset]);
  return { data: { participantName, participantEmail, consentType: consentType as ConsentType, scope, status: status as ConsentStatus, notes, grantedAt: grantedAt ?? null, expiresAt } };
}

export function validateStatusTransition(current: ConsentStatus, next: unknown, effectiveAt: unknown, note: unknown) {
  const errors: ConsentFieldErrors = {};
  const nextStatus = typeof next === "string" ? next as ConsentStatus : "" as ConsentStatus;
  const date = optionalDate(effectiveAt);
  const normalizedNote = optionalText(note);
  if (!CONSENT_STATUSES.includes(nextStatus) || !CONSENT_TRANSITIONS[current].includes(nextStatus)) errors.status = `Consent cannot move from ${current} to ${nextStatus || "that status"}.`;
  if (date === undefined) errors.effectiveAt = "Enter a valid effective date.";
  if (!date) errors.effectiveAt = "Effective date is required.";
  if (nextStatus === "withdrawn" && (!normalizedNote || normalizedNote.length < 5)) errors.note = "Provide a withdrawal reason of at least 5 characters.";
  if (normalizedNote && normalizedNote.length > 5000) errors.note = "Note cannot exceed 5,000 characters.";
  return Object.keys(errors).length ? { errors } : { data: { status: nextStatus, effectiveAt: date as Date, note: normalizedNote } };
}
