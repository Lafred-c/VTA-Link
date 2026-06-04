import type { Period, ChartType } from "./admin.types";

export const PERIODS: {key: Period; label: string}[] = [
  {key: "today", label: "Today"},
  {key: "week", label: "This Week"},
  {key: "month", label: "This Month"},
  {key: "3months", label: "3 Months"},
  {key: "year", label: "This Year"},
  {key: "all", label: "All Time"},
];

export const CHART_TYPES: {key: ChartType; label: string; color: string}[] = [
  {key: "revenue", label: "₱ Revenue", color: "#0ea5e9"},
  {key: "volume", label: "Order Volume", color: "#8b5cf6"},
  {key: "collection", label: "Collection %", color: "#10b981"},
];

export const PIPELINE_STAGES = [
  {
    key: "in_queue",
    label: "In Queue",
    color: "#3b82f6",
    bg: "bg-blue-100 text-blue-700",
  },
  {
    key: "designing",
    label: "Designing",
    color: "#8b5cf6",
    bg: "bg-purple-100 text-purple-700",
  },
  {
    key: "payment",
    label: "Payment",
    color: "#f59e0b",
    bg: "bg-amber-100 text-amber-700",
  },
  {
    key: "production",
    label: "Production",
    color: "#f97316",
    bg: "bg-orange-100 text-orange-700",
  },
  {
    key: "pickup",
    label: "Ready for Pickup",
    color: "#10b981",
    bg: "bg-green-100 text-green-700",
  },
  {
    key: "completed",
    label: "Completed",
    color: "#6b7280",
    bg: "bg-gray-100 text-gray-700",
  },
];
