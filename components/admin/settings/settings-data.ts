export type UserStatus = "Active" | "Pending" | "Suspended";
export type PreviewUser = { name: string; email: string; role: string; status: UserStatus; lastActive: string };

export const roleOptions = ["Admin", "Broadcast Operator", "Content Editor", "Viewer"];

export const initialUsers: PreviewUser[] = [
  { name: "Alex Morgan", email: "alex@amagi.com", role: "Super Admin", status: "Active", lastActive: "Now" },
  { name: "Priya Shah", email: "priya@amagi.com", role: "Broadcast Operator", status: "Active", lastActive: "12 min ago" },
  { name: "Jordan Lee", email: "jordan@amagi.com", role: "Content Editor", status: "Pending", lastActive: "Invited" },
  { name: "Sam Wilson", email: "sam@amagi.com", role: "Viewer", status: "Suspended", lastActive: "3 days ago" },
];

export const permissionGroups = [
  { name: "Dashboard", items: ["View dashboard", "View analytics", "Export analytics"] },
  { name: "Broadcast", items: ["View control room", "Start and stop broadcasts", "Manage sessions", "View recordings"] },
  { name: "Content", items: ["Manage audio", "Manage video", "Manage transcripts", "Manage translations", "Publish content"] },
  { name: "Administration", items: ["View users", "Add and edit users", "Manage roles", "Manage permissions", "View activity log"] },
];

const allPermissions = permissionGroups.flatMap((group) => group.items);

export const roles = [
  { name: "Super Admin", detail: "All workspace areas", permissions: allPermissions },
  { name: "Admin", detail: "Operations and user management", permissions: allPermissions.filter((permission) => permission !== "Manage roles" && permission !== "Manage permissions") },
  { name: "Broadcast Operator", detail: "Broadcast workflows", permissions: ["View dashboard", "View control room", "Start and stop broadcasts", "Manage sessions", "View recordings"] },
  { name: "Content Editor", detail: "Media and language workflows", permissions: ["View dashboard", "Manage audio", "Manage video", "Manage transcripts", "Manage translations", "Publish content"] },
  { name: "Viewer", detail: "Read-only overview", permissions: ["View dashboard", "View analytics", "View control room", "View recordings"] },
];

export const roleDescriptions: Record<string, string> = {
  Admin: "Workspace administration and operational access.",
  "Broadcast Operator": "Broadcast and session operations.",
  "Content Editor": "Media and language content workflows.",
  Viewer: "Read-only access to approved areas.",
};
