// auth.types.ts — Pure compile-time TypeScript declarations
// Re-export UserRole from its canonical location for convenience.
export type { UserRole } from "@/context/AuthContext";

export interface PasswordStrength {
  score: number;   // 0–5
  label: string;   // "Weak" | "Fair" | "Good" | "Strong" | "Excellent" | ""
  color: string;   // hex color string
}
