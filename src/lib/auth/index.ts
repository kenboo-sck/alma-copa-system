export type AdminRole = "owner" | "admin" | "staff";

export const defaultRolePermissions = {
  owner: [
    "events:read",
    "events:write",
    "categories:write",
    "entries:read",
    "entries:write",
    "payments:read",
    "payments:write",
    "emails:read",
    "emails:send",
    "reception:write",
    "weigh-in:write",
    "settings:write",
  ],
  admin: [
    "events:read",
    "events:write",
    "categories:write",
    "entries:read",
    "entries:write",
    "payments:read",
    "payments:write",
    "emails:read",
    "emails:send",
    "reception:write",
    "weigh-in:write",
  ],
  // 受付担当には入金・現金受領の記録（payments:write）を含めていない。
  staff: ["entries:read", "reception:write", "weigh-in:write"],
} as const;

export function canManageEvents(role: AdminRole) {
  return role === "owner" || role === "admin";
}

// 大会の編集権限（events:write）があるか。オーナーは常に可能
// （サーバー側の requireAdmin と同じ判定。firestore.rules の canEditEvents とも揃える）。
export function hasEventWritePermission(user: {
  role: AdminRole;
  permissions: readonly string[];
}) {
  return user.role === "owner" || user.permissions.includes("events:write");
}
