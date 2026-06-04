import type {
  CashAdvance,
  CashAdvanceStatus,
  PendingCashAdvance,
  PayrollPeriod,
  AttendanceLog,
  PayrollRecord,
} from "./payroll.types";

export const fmt = (n: number) =>
  `₱${Math.abs(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const periodLabel = (p: PayrollPeriod) => {
  const s = new Date(p.periodStart).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
  const e = new Date(p.periodEnd).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${s} – ${e}`;
};

export function mapCashAdvance(raw: any): CashAdvance {
  const emp = raw.employee;
  const issuer = raw.issuer;
  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeCode: emp?.employee_code || "",
    employeeName: emp?.full_name || "",
    employeePosition: emp?.position || "",
    amount: Number(raw.amount) || 0,
    dateIssued: raw.date_issued || "",
    reason: raw.reason || "",
    status: raw.status as CashAdvanceStatus,
    payrollPeriodId: raw.payroll_period_id || null,
    issuedByName: issuer
      ? `${issuer.first_name || ""} ${issuer.last_name || ""}`.trim()
      : "—",
    createdAt: raw.created_at
      ? new Date(raw.created_at).toLocaleDateString()
      : "",
    declineReason: raw.decline_reason || "",
  };
}

export function mapPendingCashAdvance(
  raw: any,
  allPending: any[]
): PendingCashAdvance {
  const emp = raw.employee;
  const dailyRate = Number(emp?.base_hourly_rate) || 0;
  const allowedLimit = 2000;
  const pendingTotal = allPending
    .filter((a) => a.employee_id === raw.employee_id && a.id !== raw.id)
    .reduce((s: number, a: any) => s + Number(a.amount), 0);
  const issuer = raw.issuer;
  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeCode: emp?.employee_code || "",
    employeeName: emp?.full_name || "",
    employeePosition: emp?.position || "",
    dailyRate,
    amount: Number(raw.amount) || 0,
    allowedLimit,
    pendingTotal,
    remainingAllowed: Math.max(0, allowedLimit - pendingTotal),
    reason: raw.reason || "",
    dateIssued: raw.date_issued || "",
    issuedByName: issuer
      ? `${issuer.first_name || ""} ${issuer.last_name || ""}`.trim()
      : "—",
  };
}

export function mapPeriod(raw: any): PayrollPeriod {
  return {
    id: raw.id,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    payDate: raw.pay_date || "",
    status: raw.status,
    createdAt: raw.created_at
      ? new Date(raw.created_at).toLocaleDateString()
      : "",
  };
}

export function mapAttendanceLog(raw: any): AttendanceLog {
  const emp = raw.employee;
  const dailyRate = Number(emp?.base_hourly_rate) || 0;
  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeCode: emp?.employee_code || "",
    fullName: emp?.full_name || "",
    position: emp?.position || "",
    dailyRate,
    workedHours: Number(raw.worked_hours) || 0,
    requiredHours: Number(raw.required_hours) || 160,
    lateTimeslots: Number(raw.late_timeslots) || 0,
    earlyLeaveTimeslots: Number(raw.early_leave_timeslots) || 0,
    regularOvertimeHours: Number(raw.regular_overtime_hours) || 0,
    holidayOvertimeHours: Number(raw.holiday_overtime_hours) || 0,
    specialOvertimeHours: Number(raw.special_overtime_hours) || 0,
    businessTripDays: Number(raw.business_trip_days) || 0,
    absences: Number(raw.absences) || 0,
    onLeaveDays: Number(raw.on_leave_days) || 0,
    additionalPay: Number(raw.additional_pay) || 0,
    deductionAmount: Number(raw.deduction_amount) || 0,
    daysPresent: Number(raw.days_present) || 0,
    hasIncompletePunch: raw.has_incomplete_punch ?? false,
    incompletePunchDates: raw.incomplete_punch_dates ?? [],
  };
}

export function mapPayrollRecord(raw: any): PayrollRecord {
  const emp = raw.employee;
  const dailyRate =
    Number(raw.daily_rate) || Number(emp?.base_hourly_rate) || 0;
  const daysPresent = Number(raw.days_present) || 0;
  const basicPay = Number(raw.basic_pay) || dailyRate * daysPresent;

  const regularOT = Number(raw.regular_overtime) || 0;
  const holidayOT = Number(raw.holiday_overtime) || 0;
  const specialOT = Number(raw.special_overtime) || 0;
  const tardyDeductions = Number(raw.tardy_deductions) || 0;
  const undertimeDeductions = Number(raw.undertime_deductions) || 0;

  const grossIncome =
    Number(raw.gross_income) ||
    basicPay +
      regularOT +
      holidayOT +
      specialOT -
      tardyDeductions -
      undertimeDeductions;
  const totalDeductions = Number(raw.total_deductions) || 0;
  const netPay = Number(raw.net_pay) || grossIncome - totalDeductions;

  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeName: emp?.full_name || "",
    employeeCode: emp?.employee_code || "",
    position: emp?.position || "",
    dailyRate,
    daysPresent,
    basicPay,
    regularHolidayPay: Number(raw.regular_holiday_pay) || 0,
    specialHolidayPay: Number(raw.special_holiday_pay) || 0,
    regularOvertime: regularOT,
    holidayOvertime: holidayOT,
    specialOvertime: specialOT,
    grossIncome,
    tardyDeductions,
    undertimeDeductions,
    sss: Number(raw.sss) || 0,
    philhealth: Number(raw.philhealth) || 0,
    hdmf: Number(raw.hdmf) || 0,
    withholdingTax: Number(raw.withholding_tax) || 0,
    cashAdvance: Number(raw.cash_advance) || 0,
    cashAdvanceIssued: Number(raw.cash_advance_issued) || 0,
    carryOverFromPrevious: Number(raw.carry_over_from_previous) || 0,
    totalDeductions,
    netPay,
    taxableIncome: Number(raw.taxable_income) || 0,
    status: raw.status || "pending",
  };
}
