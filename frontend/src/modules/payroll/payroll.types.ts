export type CashAdvanceStatus =
  | "pending"
  | "approved"
  | "deducted"
  | "declined"
  | "cancelled";

export interface CashAdvance {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePosition: string;
  amount: number;
  dateIssued: string;
  reason: string;
  status: CashAdvanceStatus;
  payrollPeriodId: string | null;
  issuedByName: string;
  createdAt: string;
  declineReason?: string;
}

export interface PendingCashAdvance {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePosition: string;
  dailyRate: number;
  amount: number;
  allowedLimit: number;
  pendingTotal: number;
  remainingAllowed: number;
  reason: string;
  dateIssued: string;
  issuedByName: string;
}

export interface PayrollPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: "draft" | "processing" | "complete";
  createdAt: string;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  dailyRate: number;
  workedHours: number;
  requiredHours: number;
  lateTimeslots: number;
  earlyLeaveTimeslots: number;
  regularOvertimeHours: number;
  holidayOvertimeHours: number;
  specialOvertimeHours: number;
  businessTripDays: number;
  absences: number;
  onLeaveDays: number;
  additionalPay: number;
  deductionAmount: number;
  daysPresent: number;
  hasIncompletePunch: boolean;
  incompletePunchDates: string[];
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  position: string;
  dailyRate: number;
  daysPresent: number;
  basicPay: number;
  regularHolidayPay: number;
  specialHolidayPay: number;
  regularOvertime: number;
  holidayOvertime: number;
  specialOvertime: number;
  grossIncome: number;
  tardyDeductions: number;
  undertimeDeductions: number;
  sss: number;
  philhealth: number;
  hdmf: number;
  withholdingTax: number;
  cashAdvance: number;
  cashAdvanceIssued: number;
  carryOverFromPrevious: number;
  totalDeductions: number;
  netPay: number;
  taxableIncome: number;
  status: "pending" | "paid";
}

export interface ExceptionalLogRow {
  employee_id: string;
  punch_date: string;
  is_incomplete: boolean;
  hours_counted: number;
}
