import {
  Clock,
  Palette,
  CreditCard,
  Hammer,
  Truck,
  CheckCircle2,
} from "lucide-react";
import type { CardStatus } from "./operations.types";

export const CA_LIMIT = 2000;

export const SIZE_STYLES: Record<string, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-1.5 text-base",
};

export const statusSteps: { status: CardStatus; icon: any; label: string }[] = [
  { status: "Queue", icon: Clock, label: "Queue" },
  { status: "Design", icon: Palette, label: "Design" },
  { status: "Payment", icon: CreditCard, label: "Payment" },
  { status: "Production", icon: Hammer, label: "Production" },
  { status: "Pick-up", icon: Truck, label: "Pick-up" },
  { status: "Complete", icon: CheckCircle2, label: "Complete" },
];
