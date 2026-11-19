export const PERMISSIONS = [
  "dashboard.read", "studio.read", "studio.control", "screens.read", "screens.manage",
  "logs.read", "feedback.read", "feedback.manage", "consents.read", "consents.manage",
  "settings.read", "settings.manage", "users.read", "users.create", "users.update",
  "users.disable", "roles.read", "roles.manage",
] as const;
export type Permission = typeof PERMISSIONS[number];

const all = [...PERMISSIONS];
export const SYSTEM_ROLES = [
  { slug: "super-admin", name: "Super Admin", description: "Full access, including users and roles.", permissions: all },
  { slug: "admin", name: "Admin", description: "Full operational access and user management.", permissions: all.filter((p) => p !== "roles.manage") },
  { slug: "operator", name: "Operator", description: "Operate studio workflows and manage broadcast records.", permissions: ["dashboard.read", "studio.read", "studio.control", "screens.read", "screens.manage", "logs.read", "feedback.read", "feedback.manage", "consents.read", "consents.manage"] },
  { slug: "viewer", name: "Viewer", description: "Read-only operational access.", permissions: ["dashboard.read", "studio.read", "screens.read", "logs.read", "feedback.read", "consents.read"] },
] satisfies { slug: string; name: string; description: string; permissions: string[] }[];

export function hasPermission(permissions: readonly string[], permission: Permission) {
  return permissions.includes(permission);
}

export function canAssignRole(actorPermissions: readonly string[], targetPermissions: readonly string[]) {
  return !targetPermissions.includes("roles.manage") || actorPermissions.includes("roles.manage");
}
