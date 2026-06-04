// auth.constants.ts — Pure static configurations (no functions, no imports)
import type { UserRole } from "@/context/AuthContext";

/** Maps each user role to its dashboard route. */
export const ROLE_ROUTES: Record<UserRole, string> = {
  customer: "/customer",
  admin: "/admin",
  cashier: "/cashier",
  designer: "/designer",
  production: "/production",
};

/** Feature cards displayed on the AuthLayout banner panel. */
export const AUTH_FEATURES = [
  { iconName: "Printer", label: "Custom Printing", desc: "High-quality prints" },
  { iconName: "Palette", label: "Design Studio",   desc: "Professional designs" },
  { iconName: "Zap",     label: "Fast Production", desc: "Quick turnaround" },
] as const;
