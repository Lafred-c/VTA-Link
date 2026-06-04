import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabaseClient';
import { payrollDb as db } from '../services/payrollDb';
import type { CashAdvance, PendingCashAdvance, PayrollPeriod, AttendanceLog, PayrollRecord } from '../payroll.types';
import { mapCashAdvance, mapPendingCashAdvance, mapPeriod, mapAttendanceLog, mapPayrollRecord } from '../payroll.utils';
import { useQuery, safe } from '@/hooks/useSupabaseQuery';

// Mappers
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
