import React from "react";
import {
  Smartphone,
  CreditCard,
  Building2,
  Clock,
  Palette,
  Hammer,
  Truck,
  CheckCircle2,
} from "lucide-react";
import type { PaymentMethod, OrderStatus } from "./crm.types";

export const QR_IMAGES: Record<PaymentMethod, string> = {
  GCash: "/images/QR1.png",
  PayMaya: "/images/QR2.png",
  "Bank Transfer": "/images/QR3.png",
};

export const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  GCash: React.createElement(Smartphone, { size: 20 }),
  PayMaya: React.createElement(CreditCard, { size: 20 }),
  "Bank Transfer": React.createElement(Building2, { size: 20 }),
};

export const METHOD_COLORS: Record<
  PaymentMethod,
  { ring: string; bg: string; text: string; badge: string }
> = {
  GCash: {
    ring: "ring-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    badge: "bg-blue-500",
  },
  PayMaya: {
    ring: "ring-green-400",
    bg: "bg-green-50",
    text: "text-green-700",
    badge: "bg-green-500",
  },
  "Bank Transfer": {
    ring: "ring-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    badge: "bg-amber-500",
  },
};

export const statusSteps: { status: OrderStatus; icon: any; label: string }[] = [
  { status: "Queue", icon: Clock, label: "Queue" },
  { status: "Design", icon: Palette, label: "Design" },
  { status: "Payment", icon: CreditCard, label: "Payment" },
  { status: "Production", icon: Hammer, label: "Production" },
  { status: "Pick-up", icon: Truck, label: "Pick-up" },
  { status: "Complete", icon: CheckCircle2, label: "Complete" },
];
