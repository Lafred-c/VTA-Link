// auth.utils.ts — Pure logic and helper functions (may import types/constants)
import type { PasswordStrength } from "./auth.types";

/**
 * Shared Framer Motion "fade up" variant.
 * Used by LoginForm, SignUpForm, and AuthLayout so each doesn't define its own copy.
 */
export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const, delay },
  }),
};

/**
 * Creates a floating animation variant for decorative shapes in AuthLayout.
 * @param yRange   vertical pixel travel distance
 * @param rotRange rotation degree range
 * @param dur      animation duration in seconds
 */
export const floatVariant = (yRange: number, rotRange: number, dur: number) => ({
  animate: {
    y: [0, -yRange, 0],
    rotate: [0, rotRange, 0],
    transition: { duration: dur, ease: "easeInOut" as const, repeat: Infinity },
  },
});

/**
 * Creates a pulsing ring animation variant for decorative rings in AuthLayout.
 * @param delay  animation start delay in seconds
 */
export const pulseRing = (delay: number = 0) => ({
  animate: {
    scale: [1, 1.08, 1],
    opacity: [0.35, 0.55, 0.35],
    transition: {
      duration: 4,
      ease: "easeInOut" as const,
      repeat: Infinity,
      delay,
    },
  },
});

/**
 * Computes password strength based on length, character variety, and symbols.
 * Returns a score (0–5), a descriptive label, and a representative hex color.
 */
export function computePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password))   score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: "Weak",      color: "#ef4444" };
  if (score <= 2) return { score: 2, label: "Fair",      color: "#f59e0b" };
  if (score <= 3) return { score: 3, label: "Good",      color: "#3b82f6" };
  if (score <= 4) return { score: 4, label: "Strong",    color: "#22c55e" };
  return           { score: 5, label: "Excellent", color: "#10b981" };
}
