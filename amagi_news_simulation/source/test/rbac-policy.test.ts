import assert from "node:assert/strict";
import test from "node:test";
import { canAssignRole, hasPermission, PERMISSIONS, SYSTEM_ROLES } from "../lib/rbac-policy";

const role = (slug: string) => SYSTEM_ROLES.find((item) => item.slug === slug)!;

test("permission keys are unique", () => {
  assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length);
});

test("super admin has every permission", () => {
  assert.deepEqual(new Set(role("super-admin").permissions), new Set(PERMISSIONS));
});

test("admin cannot manage roles", () => {
  assert.equal(hasPermission(role("admin").permissions, "roles.manage"), false);
  assert.equal(hasPermission(role("admin").permissions, "users.create"), true);
});

test("operator can control studio but cannot manage users", () => {
  assert.equal(hasPermission(role("operator").permissions, "studio.control"), true);
  assert.equal(hasPermission(role("operator").permissions, "users.read"), false);
});

test("viewer is read only", () => {
  assert.equal(role("viewer").permissions.some((permission) => permission.endsWith(".manage") || permission.endsWith(".control") || permission === "users.create"), false);
});

test("only role managers can assign privileged roles", () => {
  assert.equal(canAssignRole(role("admin").permissions, role("super-admin").permissions), false);
  assert.equal(canAssignRole(role("super-admin").permissions, role("super-admin").permissions), true);
  assert.equal(canAssignRole(role("admin").permissions, role("viewer").permissions), true);
});
