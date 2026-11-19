export const adminNavigation = [
  { label: "Dashboard", href: "/admin", icon: "grid", permission: "dashboard.read" },
  { label: "Camera Studio", href: "/admin/studio/camera", icon: "studio", permission: "studio.read" },
  { label: "Screen List", href: "/admin/control-room", icon: "control-room", permission: "screens.read" },
  { label: "Generation Logs", href: "/admin/generation-logs", icon: "tasks", permission: "logs.read" },
  { label: "Feedback", href: "/admin/feedback", icon: "feedback", permission: "feedback.read" },
  { label: "Consents", href: "/admin/consents", icon: "consent", permission: "consents.read" },
  { label: "Settings", href: "/admin/settings", icon: "settings", permission: "settings.read" },
] as const;
