export const FEEDBACK_CATEGORIES = ["general", "content", "broadcast", "technical", "other"] as const;
export const FEEDBACK_STATUSES = ["new", "reviewed", "resolved"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackInput = {
  name: string;
  email: string | null;
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  status: FeedbackStatus;
};

export type FeedbackFieldErrors = Partial<Record<"name" | "email" | "category" | "rating" | "message" | "status", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatFeedbackLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function validateFeedbackInput(value: unknown): { data?: FeedbackInput; errors?: FeedbackFieldErrors } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const category = typeof input.category === "string" ? input.category : "";
  const status = typeof input.status === "string" ? input.status : "new";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const ratingValue = input.rating === "" || input.rating == null ? null : Number(input.rating);
  const errors: FeedbackFieldErrors = {};

  if (!name || name.length > 100) errors.name = "Enter a name between 1 and 100 characters.";
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) errors.email = "Enter a valid email address.";
  if (!FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) errors.category = "Select a valid category.";
  if (ratingValue !== null && (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)) errors.rating = "Rating must be between 1 and 5.";
  if (message.length < 10 || message.length > 5000) errors.message = "Enter feedback between 10 and 5,000 characters.";
  if (!FEEDBACK_STATUSES.includes(status as FeedbackStatus)) errors.status = "Select a valid status.";

  if (Object.keys(errors).length) return { errors };
  return {
    data: {
      name,
      email: email || null,
      category: category as FeedbackCategory,
      rating: ratingValue,
      message,
      status: status as FeedbackStatus,
    },
  };
}
