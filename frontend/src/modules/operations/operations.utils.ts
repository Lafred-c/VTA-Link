import type { CardStatus } from "./operations.types";
import type { Order, OrderStatus, PaymentStatus } from "@/Types";
import { fmtDate } from "@/util/formatters";

export const fmt = (n: number) =>
  `₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export const mapStatusStep = (status: string): CardStatus => {
  const map: Record<string, CardStatus> = {
    "In Queue": "Queue",
    Designing: "Design",
    "Design Approval": "Design",
    Payment: "Payment",
    Production: "Production",
    Pickup: "Pick-up",
    Completed: "Complete",
    Cancelled: "Queue",
  };
  return map[status] || "Queue";
};

export function sanitizeStorageUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace("/order-attachments/", "/order-files/");
}

export function mapStatus(s: string): OrderStatus {
  const m: Record<string, OrderStatus> = {
    in_queue: "In Queue",
    designing: "Designing",
    payment: "Payment",
    production: "Production",
    pickup: "Pickup",
    completed: "Completed",
    overdue: "Overdue",
    cancelled: "Cancelled",
    cancel_requested: "Cancel Requested",
  };
  return m[s] || (s as OrderStatus);
}

export function mapPayment(s: string): PaymentStatus {
  const m: Record<string, PaymentStatus> = {
    paid: "Paid",
    unpaid: "Unpaid",
    partial: "Partially paid",
  };
  return m[s] || (s as PaymentStatus);
}

export function mapOrder(raw: any): Order {
  const c = raw.customer;
  const items = raw.order_items || [];
  return {
    id: raw.id,
    orderId: raw.order_number || "",
    customerId: raw.customer_id || "",
    customerName: c
      ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
      : "Walk-in",
    customerEmail: c?.email || "",
    customerPhone: c?.contact_number || "",
    productType:
      items[0]?.product_name || (items.length > 1 ? "Multiple" : "—"),
    quantity: items.reduce((s: number, i: any) => s + (i.quantity || 0), 0),
    totalAmount: Number(raw.total_amount) || 0,
    status: mapStatus(raw.status),
    paymentStatus: mapPayment(raw.payment_status),
    dateOrdered: fmtDate(raw.created_at),
    dueDate: fmtDate(raw.due_date),
    specialInstructions:
      raw.special_instructions || items[0]?.specifications || "",
    designFile: raw.design_file_url || items[0]?.file_url || "",
    assignedDesigner: raw.assigned_designer || "",
    assignedProduction: raw.assigned_production || "",
    designerName: raw.designer
      ? `${raw.designer.first_name || ""} ${raw.designer.last_name || ""}`.trim()
      : "",
    productionName: raw.production_staff
      ? raw.production_staff.full_name || ""
      : "",
    comments: raw.comments || "",
    amountPaid: Number(raw.amount_paid) || 0,
    orderType: raw.order_type || "walk-in",
    finalDesignUrl: raw.final_design_url || "",
    lastDeclineReason: raw.last_decline_reason || "",
    hasUnreadDecline: !!raw.has_unread_decline,
    isSuki: !!c?.is_suki,
    payments: Array.isArray(raw.payments)
      ? raw.payments.map((p: any) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          payment_method: p.payment_method,
          reference_number: p.reference_number,
          created_at: p.created_at,
          status: (p.status || "pending") as "approved" | "declined" | "pending",
          decline_reason: p.decline_reason,
        }))
      : [],
    cancelReason: raw.cancel_reason || "",
    rejectedByDesigners: raw.rejected_by_designers || [],
  };
}
