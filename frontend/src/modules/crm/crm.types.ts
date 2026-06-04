export type PaymentMethod = "GCash" | "PayMaya" | "Bank Transfer";
export type PaymentType = "full" | "partial";

export type OrderStatus =
  | "Queue"
  | "Design"
  | "Payment"
  | "Production"
  | "Pick-up"
  | "Complete";
