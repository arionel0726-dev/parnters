import type { User } from "@vizaje/db"

export type Role = User["role"]
export type Permission =
  | "partners:read"
  | "partners:write"
  | "applications:read"
  | "applications:write"
  | "agreements:read"
  | "agreements:write"
  | "audit:read"
  | "settings:read"
  | "settings:write"
  | "users:manage"

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  super_admin: [
    "partners:read",
    "partners:write",
    "applications:read",
    "applications:write",
    "agreements:read",
    "agreements:write",
    "audit:read",
    "settings:read",
    "settings:write",
    "users:manage",
  ],
  program_manager: [
    "partners:read",
    "partners:write",
    "applications:read",
    "applications:write",
    "agreements:read",
    "agreements:write",
    "audit:read",
    "settings:read",
  ],
  support: ["partners:read", "applications:read", "agreements:read", "audit:read", "settings:read"],
  finance: ["partners:read", "agreements:read", "agreements:write", "audit:read"],
  analyst: ["partners:read", "agreements:read", "audit:read", "settings:read"],
}

export function hasPermission(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
