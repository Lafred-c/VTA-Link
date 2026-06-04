import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabaseClient';
import { payrollDb as db } from '../services/payrollDb';;
export type CashAdvanceStatus =
  | 'pending' | 'approved' | 'deducted' | 'declined' | 'cancelled';

export interface CashAdvance {
  id: string; employeeId: string; employeeCode: string; employeeName: string; employeePosition: string;
  amount: number; dateIssued: string; reason: string; status: CashAdvanceStatus;
  payrollPeriodId: string | null; issuedByName: string; createdAt: string; declineReason?: string;
}

export interface PendingCashAdvance {
  id: string; employeeId: string; employeeCode: string; employeeName: string; employeePosition: string;
  dailyRate: number; amount: number; allowedLimit: number; pendingTotal: number; remainingAllowed: number;
  reason: string; dateIssued: string; issuedByName: string;
}

export interface PayrollPeriod {
  id: string; periodStart: string; periodEnd: string; payDate: string;
  status: 'draft' | 'processing' | 'complete'; createdAt: string;
}

export interface AttendanceLog {
  id: string; employeeId: string; employeeCode: string; fullName: string;
  position: string; dailyRate: number; workedHours: number; requiredHours: number;
  lateTimeslots: number; earlyLeaveTimeslots: number; regularOvertimeHours: number;
  holidayOvertimeHours: number; specialOvertimeHours: number; businessTripDays: number;
  absences: number; onLeaveDays: number; additionalPay: number; deductionAmount: number;
  daysPresent: number;
  hasIncompletePunch: boolean;
  incompletePunchDates: string[];
}

export interface PayrollRecord {
  id: string; employeeId: string; employeeName: string; employeeCode: string;
  position: string; dailyRate: number; daysPresent: number; basicPay: number;
  regularHolidayPay: number; specialHolidayPay: number; regularOvertime: number;
  holidayOvertime: number; specialOvertime: number; grossIncome: number;
  tardyDeductions: number; undertimeDeductions: number; sss: number; philhealth: number;
  hdmf: number; withholdingTax: number; cashAdvance: number; cashAdvanceIssued: number;
  carryOverFromPrevious: number;
  totalDeductions: number; netPay: number; taxableIncome: number; status: 'pending' | 'paid';
}
import { useQuery, safe } from '@/hooks/useSupabaseQuery';

// Mappers
function mapCashAdvance(raw: any): CashAdvance {
  const emp = raw.employee; const issuer = raw.issuer;
  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeCode: emp?.employee_code || '',
    employeeName: emp?.full_name || '',
    employeePosition: emp?.position || '',
    amount: Number(raw.amount) || 0,
    dateIssued: raw.date_issued || '',
    reason: raw.reason || '',
    status: raw.status as CashAdvanceStatus,
    payrollPeriodId: raw.payroll_period_id || null,
    issuedByName: issuer ? `${issuer.first_name || ''} ${issuer.last_name || ''}`.trim() : '—',
    createdAt: raw.created_at ? new Date(raw.created_at).toLocaleDateString() : '',
    declineReason: raw.decline_reason || '',
  };
}

function mapPendingCashAdvance(raw: any, allPending: any[]): PendingCashAdvance {
  const emp = raw.employee; const dailyRate = Number(emp?.base_hourly_rate) || 0;
  const allowedLimit = 2000;
  const pendingTotal = allPending.filter(a => a.employee_id === raw.employee_id && a.id !== raw.id).reduce((s: number, a: any) => s + Number(a.amount), 0);
  const issuer = raw.issuer;
  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeCode: emp?.employee_code || '',
    employeeName: emp?.full_name || '',
    employeePosition: emp?.position || '',
    dailyRate,
    amount: Number(raw.amount) || 0,
    allowedLimit,
    pendingTotal,
    remainingAllowed: Math.max(0, allowedLimit - pendingTotal),
    reason: raw.reason || '',
    dateIssued: raw.date_issued || '',
    issuedByName: issuer ? `${issuer.first_name || ''} ${issuer.last_name || ''}`.trim() : '—',
  };
}

function mapPeriod(raw: any): PayrollPeriod {
  return {
    id: raw.id,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    payDate: raw.pay_date || '',
    status: raw.status,
    createdAt: raw.created_at ? new Date(raw.created_at).toLocaleDateString() : '',
  };
}

function mapAttendanceLog(raw: any): AttendanceLog {
  const emp = raw.employee;
  const dailyRate = Number(emp?.base_hourly_rate) || 0;
  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeCode: emp?.employee_code || '',
    fullName: emp?.full_name || '',
    position: emp?.position || '',
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

function mapPayrollRecord(raw: any): PayrollRecord {
  const emp = raw.employee;
  const dailyRate = Number(raw.daily_rate) || Number(emp?.base_hourly_rate) || 0;
  const daysPresent = Number(raw.days_present) || 0;
  const basicPay = Number(raw.basic_pay) || (dailyRate * daysPresent);
  
  const regularOT = Number(raw.regular_overtime) || 0;
  const holidayOT = Number(raw.holiday_overtime) || 0;
  const specialOT = Number(raw.special_overtime) || 0;
  const tardyDeductions = Number(raw.tardy_deductions) || 0;
  const undertimeDeductions = Number(raw.undertime_deductions) || 0;
  
  const grossIncome = Number(raw.gross_income) || (basicPay + regularOT + holidayOT + specialOT - tardyDeductions - undertimeDeductions);
  const totalDeductions = Number(raw.total_deductions) || 0;
  const netPay = Number(raw.net_pay) || (grossIncome - totalDeductions);

  return {
    id: raw.id,
    employeeId: raw.employee_id,
    employeeName: emp?.full_name || '',
    employeeCode: emp?.employee_code || '',
    position: emp?.position || '',
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
    status: raw.status || 'pending',
  };
}

// Hooks
export function useCashAdvances(filters?: { employee_id?: string; status?: string }) {
  const q = useQuery(() => db.cashAdvances.getAll(filters), [filters?.employee_id, filters?.status], ['cash_advances', 'employees']);
  const advances: CashAdvance[] = (q.data || []).map(mapCashAdvance);
  const stats = {
    total: advances.length,
    pending: advances.filter(a => a.status === 'pending').length,
    approved: advances.filter(a => a.status === 'approved').length,
    deducted: advances.filter(a => a.status === 'deducted').length,
    cancelled: advances.filter(a => a.status === 'cancelled').length,
    totalPending: advances.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0),
  };
  return {
    advances,
    stats,
    loading: q.loading,
    error: q.error,
    refresh: q.refresh,
    createAdvance: async (data: { employee_id: string; amount: number; date_issued?: string; reason?: string }) => {
      const r = await safe(() => db.cashAdvances.create(data).then(() => q.refresh()));
      return r;
    },
    cancelAdvance: async (id: string) => {
      const r = await safe(() => db.cashAdvances.cancel(id).then(() => q.refresh()));
      return r;
    },
  };
}

export function usePendingCashAdvances() {
  const q = useQuery(() => db.cashAdvances.getPendingRequests(), [], ['cash_advances', 'employees']);
  const rawAll = (q.data || []) as any[];
  const pendingAdvances: PendingCashAdvance[] = rawAll.map(raw => mapPendingCashAdvance(raw, rawAll));
  return {
    pendingAdvances,
    loading: q.loading,
    error: q.error,
    refresh: q.refresh,
    approveAdvance: async (id: string) => {
      const r = await safe(() => db.cashAdvances.approve(id).then(() => q.refresh()));
      return r;
    },
    declineAdvance: async (id: string, reason: string) => {
      const r = await safe(() => db.cashAdvances.decline(id, reason).then(() => q.refresh()));
      return r;
    },
  };
}

export function usePayrollData() {
  const [selectedPeriodId, setSelectedPeriodIdRaw] = useState<string | null>(
    () => localStorage.getItem('operix_last_period')
  );
  const [computing, setComputing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const periodsQ = useQuery(() => db.payroll.getPeriods(), [], ['payroll_periods']);
  const periods: PayrollPeriod[] = (periodsQ.data || []).map(mapPeriod);

  const savedIsValid = selectedPeriodId ? !!periods.find(p => p.id === selectedPeriodId) : false;
  const activePeriodId = (savedIsValid ? selectedPeriodId : null) || periods[0]?.id || null;
  const currentPeriod = periods.find(p => p.id === activePeriodId) || null;

  const setSelectedPeriodId = (id: string | null) => {
    if (id) localStorage.setItem('operix_last_period', id);
    else localStorage.removeItem('operix_last_period');
    setSelectedPeriodIdRaw(id);
  };

  const attendanceQ = useQuery(
    () => activePeriodId ? db.payroll.getAttendanceLogs(activePeriodId) : Promise.resolve([]),
    ['attendance', activePeriodId],
    ['attendance_logs', 'employees']
  );
  const payrollQ = useQuery(
    () => activePeriodId ? db.payroll.getPayrollRecords(activePeriodId) : Promise.resolve([]),
    ['payroll', activePeriodId],
    ['payroll_records', 'employees']
  );

  const attendanceLogs: AttendanceLog[] = (attendanceQ.data || []).map(mapAttendanceLog);
  const payrollRecords: PayrollRecord[] = (payrollQ.data || []).map(mapPayrollRecord);

  const dashboardStats = {
    totalEmployees: attendanceLogs.length,
    grossPayroll: payrollRecords.reduce((s, r) => s + r.grossIncome, 0),
    netPayroll: payrollRecords.reduce((s, r) => s + r.netPay, 0),
    totalDeductions: payrollRecords.reduce((s, r) => s + r.totalDeductions, 0),
    totalWorkHours: Math.round(attendanceLogs.reduce((s, l) => s + l.workedHours, 0) * 100) / 100,
    totalOvertimeHours: Math.round(attendanceLogs.reduce((s, l) => s + l.regularOvertimeHours + l.holidayOvertimeHours + l.specialOvertimeHours, 0) * 100) / 100,
    totalAbsences: attendanceLogs.reduce((s, l) => s + l.absences, 0),
  };

  const loading = periodsQ.loading || attendanceQ.loading || payrollQ.loading;
  const error = periodsQ.error || attendanceQ.error || payrollQ.error;

  const refresh = useCallback(() => {
    periodsQ.refresh(); attendanceQ.refresh(); payrollQ.refresh();
  }, [activePeriodId]);

  return {
    periods, currentPeriod, activePeriodId, attendanceLogs, payrollRecords,
    dashboardStats, loading, error, computing, resetting,
    setSelectedPeriodId, refresh,

    createPeriod: async (data: { period_start: string; period_end: string; pay_date?: string }) => {
      const r = await safe(() => db.payroll.createPeriod(data).then(() => periodsQ.refresh()));
      return r;
    },

    updateAttendanceLog: async (log: {
      employee_id: string; payroll_period_id: string; worked_hours?: number;
      required_hours?: number; late_timeslots?: number; early_leave_timeslots?: number;
      regular_overtime_hours?: number; holiday_overtime_hours?: number;
      special_overtime_hours?: number; business_trip_days?: number;
      absences?: number; on_leave_days?: number; additional_pay?: number; deduction_amount?: number;
    }) => {
      const r = await safe(() => db.payroll.upsertAttendanceLog(log).then(() => attendanceQ.refresh()));
      return r;
    },

    computePayroll: async (periodId: string) => {
      setComputing(true);
      const r = await safe(async () => {
        const { count } = await supabase
          .from('payroll_records')
          .select('id', { count: 'exact', head: true })
          .eq('payroll_period_id', periodId);
        if (!count || count === 0) {
          await supabase.rpc('fix_incomplete_punches_for_period', { p_period_id: periodId });
          await attendanceQ.refresh();
        }
        await db.payroll.computePayroll(periodId);
        await attendanceQ.refresh();
        await payrollQ.refresh();
      });
      setComputing(false);
      return r;
    },

    resetPayroll: async (periodId: string) => {
      setResetting(true);
      const r = await safe(async () => {
        await db.payroll.resetPayroll(periodId);
        payrollQ.refresh();
        attendanceQ.refresh();
      });
      setResetting(false);
      return r;
    },

    deletePeriod: async (periodId: string) => {
      const r = await safe(async () => {
        await db.payroll.deletePeriod(periodId);
        if (selectedPeriodId === periodId) {
          setSelectedPeriodId(null);
        }
        periodsQ.refresh();
        attendanceQ.refresh();
        payrollQ.refresh();
      });
      return r;
    },

    updatePayrollRecord: async (id: string, updates: Record<string, any>) => {
      const r = await safe(() => db.payroll.updatePayrollRecord(id, updates).then(() => payrollQ.refresh()));
      return r;
    },

    markPeriodComplete: async (periodId: string) => {
      const r = await safe(() => db.payroll.updatePeriod(periodId, { status: 'complete' }).then(() => periodsQ.refresh()));
      return r;
    },

    markAllPaid: async (periodId: string) => {
      const r = await safe(async () => {
        const records = await db.payroll.getPayrollRecords(periodId);
        for (const rec of records) { await db.payroll.updatePayrollRecord(rec.id, { status: 'paid' }); }
        payrollQ.refresh();
      });
      return r;
    },
  };
}
