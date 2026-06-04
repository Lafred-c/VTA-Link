import type { Period, ChartType, Bucket } from "./admin.types";

export function getPeriodStart(period: Period): Date {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return d;
    case "week":
      d.setDate(now.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      return d;
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    case "3months":
      d.setMonth(now.getMonth() - 2, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    case "year":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    default:
      return new Date(0);
  }
}

export function filterByPeriod(orders: any[], period: Period): any[] {
  if (period === "all") return orders;
  const start = getPeriodStart(period);
  return orders.filter((o) => o.created_at && new Date(o.created_at) >= start);
}

export function computeStats(orders: any[]) {
  const now = new Date();
  const revenue = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const collected = orders.reduce(
    (s, o) => s + (Number(o.amount_paid) || 0),
    0,
  );
  return {
    revenue,
    collected,
    outstanding: Math.max(0, revenue - collected),
    total: orders.length,
    completed: orders.filter((o) => o.status === "completed").length,
    overdue: orders.filter(
      (o) =>
        o.due_date &&
        new Date(o.due_date) < now &&
        !["completed", "pickup", "cancelled"].includes(o.status),
    ).length,
    unassigned: orders.filter((o) => o.status === "in_queue" && !o.assigned_designer).length,
    collectionRate: revenue > 0 ? Math.round((collected / revenue) * 100) : 0,
  };
}

export function getBuckets(period: Period): Bucket[] {
  const now = new Date();
  if (period === "today") {
    return Array.from({length: 8}).map((_, i) => {
      const h = new Date(now);
      h.setHours(now.getHours() - (7 - i), 0, 0, 0);
      const end = new Date(h);
      end.setMinutes(59, 59, 999);
      return {
        label: h.toLocaleTimeString("en-US", {
          hour: "numeric", 
          hour12: true,
          timeZone: "Asia/Manila"
        }),
        start: new Date(h),
        end,
      };
    });
  }
  if (period === "week") {
    return Array.from({length: 7}).map((_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return {
        label: d.toLocaleDateString("en-US", {
          weekday: "short",
          timeZone: "Asia/Manila"
        }),
        start,
        end,
      };
    });
  }
  if (period === "month") {
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const step = Math.ceil(dim / 8);
    const buckets: Bucket[] = [];
    for (let day = 1; day <= dim; day += step) {
      const start = new Date(now.getFullYear(), now.getMonth(), day);
      const end = new Date(
        now.getFullYear(),
        now.getMonth(),
        Math.min(day + step - 1, dim),
        23,
        59,
        59,
      );
      buckets.push({label: String(day), start, end});
    }
    return buckets;
  }
  if (period === "3months") {
    return Array.from({length: 3}).map((_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - (2 - i) + 1,
        0,
        23,
        59,
        59,
      );
      return {
        label: start.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "Asia/Manila"
        }),
        start,
        end,
      };
    });
  }
  if (period === "year") {
    return Array.from({length: 12}).map((_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - (11 - i) + 1,
        0,
        23,
        59,
        59,
      );

      return {
        label: start.toLocaleDateString("en-US", {
          month: "short",
          timeZone: "Asia/Manila"
        }),
        start,
        end,
      };
    });
  }
  // all → last 6 months
  return Array.from({length: 6}).map((_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const end = new Date(
      now.getFullYear(),
      now.getMonth() - (5 - i) + 1,
      0,
      23,
      59,
      59,
    );
    return {
      label: start.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "Asia/Manila"
      }),
      start,
      end,
    };
  });
}

export function buildChartData(orders: any[], period: Period, chartType: ChartType) {
  return getBuckets(period).map((b) => {
    const bo = orders.filter((o) => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d >= b.start && d <= b.end;
    });
    let value = 0;
    if (chartType === "revenue") {
      value = bo.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    } else if (chartType === "volume") {
      value = bo.length;
    } else {
      const rev = bo.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      const col = bo.reduce((s, o) => s + (Number(o.amount_paid) || 0), 0);
      value = rev > 0 ? Math.round((col / rev) * 100) : 0;
    }
    return {label: b.label, value};
  });
}
