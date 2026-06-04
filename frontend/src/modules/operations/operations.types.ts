export type CardStatus =
  | "Queue"
  | "Design"
  | "Payment"
  | "Production"
  | "Pick-up"
  | "Complete";

export interface CashAdvanceEligibility {
  eligible: boolean;
  reason: "eligible" | "limit_reached";
  remaining: number;
  totalUsed: number;
}
