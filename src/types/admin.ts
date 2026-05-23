import type { AdminRole } from "@/lib/auth";

export type AdminPermission =
  | "events:read"
  | "events:write"
  | "categories:write"
  | "entries:read"
  | "entries:write"
  | "payments:read"
  | "emails:read"
  | "emails:send"
  | "reception:write"
  | "weigh-in:write"
  | "settings:write";

export type AdminUserDocument = {
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
};

export type AdminUser = AdminUserDocument & {
  uid: string;
};
