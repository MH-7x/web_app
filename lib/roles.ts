export const ROLE_LABELS: Record<string, string> = { super_admin: "Super admin", admin: "Admin" }

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role
