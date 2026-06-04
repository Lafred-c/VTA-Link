import type { OrderStatus } from "./crm.types";

export function sanitizeStorageUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace("/order-attachments/", "/order-files/");
}

export function mapBackendStatusToStep(status: string): OrderStatus {
  const s = status.toLowerCase();
  if (s === "in_queue" || s === "in queue") return "Queue";
  if (s === "designing") return "Design";
  if (s === "payment") return "Payment";
  if (s === "production") return "Production";
  if (s === "pickup") return "Pick-up";
  if (s === "completed") return "Complete";
  return "Queue";
}

export function getStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "Queue":
      return "In Queue";
    case "Design":
      return "Designing";
    case "Payment":
      return "Payment Confirmation";
    case "Production":
      return "In Production";
    case "Pick-up":
      return "Ready to Pickup";
    case "Complete":
      return "Complete";
    default:
      return status;
  }
}
