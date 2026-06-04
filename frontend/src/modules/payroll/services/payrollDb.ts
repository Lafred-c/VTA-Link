import { supabase } from '@/config/supabaseClient';
import { adminDb } from '@/modules/admin/services/adminDb';

// ── Namespace: cashAdvances ──
async function cashAdvances_getAll(filters?: { employee_id?: string; status?: string }) {
      let query = supabase
        .from("cash_advances")
        .select(
          `
          *,
          employee:employee_id(id, employee_code, full_name, position),
          issuer:issued_by(id, first_name, last_name)
        `,
        )
        .order("created_at", { ascending: false });

      if (filters?.employee_id)
        query = query.eq("employee_id", filters.employee_id);
      if (filters?.status) query = query.eq("status", filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

async function cashAdvances_create(advance: {
      employee_id: string;
      amount: number;
      date_issued?: string;
      reason?: string;
    }) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("cash_advances")
        .insert([
          {
            ...advance,
            date_issued:
              advance.date_issued || new Date().toISOString().split("T")[0],
            status: "pending",
            issued_by: user.id,
          },
        ])
        .select(
          `
          *,
          employee:employee_id(id, employee_code, full_name, position),
          issuer:issued_by(id, first_name, last_name)
        `,
        )
        .single();

      if (error) throw error;
      return data;
    }

async function cashAdvances_cancel(id: string) {
      const { data, error } = await supabase
        .from("cash_advances")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function cashAdvances_approve(id: string) {
      const { data, error } = await supabase
        .from("cash_advances")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function cashAdvances_decline(id: string, declineReason: string) {
      const { data, error } = await supabase
        .from("cash_advances")
        .update({
          status: "declined",
          decline_reason: declineReason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function cashAdvances_getPendingRequests() {
      const { data, error } = await supabase
        .from("cash_advances")
        .select(
          `
          *,
          employee:employee_id(
            id, employee_code, full_name, position, base_hourly_rate
          ),
          issuer:issued_by(id, first_name, last_name)
        `,
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    }

async function cashAdvances_checkEligibility(employeeId: string, customDate?: string): Promise<{
      eligible: boolean;
      reason: "eligible" | "limit_reached";
      remaining: number;
      totalUsed: number;
    }> {
      const MAX = 2000;
      const today = customDate || new Date().toISOString().split("T")[0];

      const { data: currentPeriodRow } = await supabase
        .from("payroll_periods")
        .select("id, period_start, period_end")
        .lte("period_start", today)
        .gte("period_end", today)
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      const getCalendarBounds = () => {
        const d = new Date();
        const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
        if (day <= 15) {
          return {
            currentStart: new Date(y, m, 1).toISOString().split("T")[0],
            currentEnd: new Date(y, m, 15).toISOString().split("T")[0],
          };
        }
        const last = new Date(y, m + 1, 0).getDate();
        return {
          currentStart: new Date(y, m, 16).toISOString().split("T")[0],
          currentEnd: new Date(y, m, last).toISOString().split("T")[0],
        };
      };

      const currentPeriodId = currentPeriodRow?.id ?? null;
      const { currentStart, currentEnd } = currentPeriodRow
        ? { currentStart: currentPeriodRow.period_start, currentEnd: currentPeriodRow.period_end }
        : getCalendarBounds();

      const { data: pendingApproved } = await supabase
        .from("cash_advances")
        .select("amount")
        .eq("employee_id", employeeId)
        .in("status", ["pending", "approved"]);

      const deductedCurrentQuery = supabase
        .from("cash_advances")
        .select("amount")
        .eq("employee_id", employeeId)
        .in("status", ["added_to_current_payroll", "deducted"]);

      const { data: processedCurrent } = currentPeriodId
        ? await deductedCurrentQuery.eq("payroll_period_id", currentPeriodId)
        : await deductedCurrentQuery
          .gte("date_issued", currentStart)
          .lte("date_issued", currentEnd);

      const totalUsed = [
        ...(pendingApproved || []),
        ...(processedCurrent || []),
      ].reduce((s: number, a: any) => s + Number(a.amount), 0);

      const remaining = Math.max(0, MAX - totalUsed);

      if (remaining <= 0) {
        return { eligible: false, reason: "limit_reached", remaining: 0, totalUsed };
      }

      return { eligible: true, reason: "eligible", remaining, totalUsed };
    }

async function cashAdvances_requestByCashier(data: {
      employee_id: string;
      amount: number;
      reason?: string;
      date_issued?: string;
    }) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const MAX_AMOUNT = 2000;
      const amount = Math.round(data.amount);

      if (amount <= 0 || amount > MAX_AMOUNT) {
        throw new Error(
          `Amount must be between ₱1 and ₱${MAX_AMOUNT.toLocaleString()}`,
        );
      }

      const targetDate = data.date_issued || new Date().toISOString().split("T")[0];
      const { data: currentPeriodRow } = await supabase
        .from("payroll_periods")
        .select("id, period_start, period_end")
        .lte("period_start", targetDate)
        .gte("period_end", targetDate)
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentPeriodId = currentPeriodRow?.id ?? null;

      const d = new Date(targetDate + "T12:00:00");
      const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
      const currentStart =
        currentPeriodRow?.period_start ??
        (day <= 15
          ? new Date(y, m, 1).toISOString().split("T")[0]
          : new Date(y, m, 16).toISOString().split("T")[0]);

      const { data: pendingApproved } = await supabase
        .from("cash_advances")
        .select("amount")
        .eq("employee_id", data.employee_id)
        .in("status", ["pending", "approved"]);

      const processedCurrentQuery = supabase
        .from("cash_advances")
        .select("amount")
        .eq("employee_id", data.employee_id)
        .in("status", ["added_to_current_payroll", "deducted"]);

      const { data: processedCurrent } = currentPeriodId
        ? await processedCurrentQuery.eq("payroll_period_id", currentPeriodId)
        : await processedCurrentQuery.gte("date_issued", currentStart);

      const periodTotal = [
        ...(pendingApproved || []),
        ...(processedCurrent || []),
      ].reduce((s: number, a: any) => s + Number(a.amount), 0);

      if (periodTotal + amount > MAX_AMOUNT) {
        throw new Error(
          `This request would exceed the ₱${MAX_AMOUNT.toLocaleString()} period limit. ` +
          `Remaining: ₱${(MAX_AMOUNT - periodTotal).toLocaleString()}`,
        );
      }

      const { data: result, error } = await supabase
        .from("cash_advances")
        .insert([
          {
            employee_id: data.employee_id,
            amount,
            date_issued: targetDate,
            reason: data.reason || null,
            status: "pending",
            issued_by: user.id,
            requested_by_cashier: user.id,
          },
        ])
        .select(
          `
          *,
          employee:employee_id(id, employee_code, full_name, position),
          issuer:issued_by(id, first_name, last_name)
        `,
        )
        .single();

      if (error) throw error;

      await adminDb.logAudit("Request Cash Advance", "cash_advances", result.id, {
        employee_name: result.employee?.full_name,
        amount: result.amount,
        requested_by: user.id
      });
      await adminDb.notifyRoles(['admin'], "New Cash Advance Request", `${result.employee?.full_name} is requesting ₱${result.amount.toLocaleString()}.`, 'payroll', result.id);

      return result;
    }

async function cashAdvances_getPendingCount(): Promise<number> {
      const { count, error } = await supabase
        .from("cash_advances")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    }

async function cashAdvances_getPendingTotal(employeeId: string): Promise<number> {
      const { data, error } = await supabase
        .from("cash_advances")
        .select("amount")
        .eq("employee_id", employeeId)
        .eq("status", "pending");
      if (error) throw error;
      return (data || []).reduce((s, a) => s + Number(a.amount), 0);
    }

export const cashAdvances = {
  getAll: cashAdvances_getAll,
  create: cashAdvances_create,
  cancel: cashAdvances_cancel,
  approve: cashAdvances_approve,
  decline: cashAdvances_decline,
  getPendingRequests: cashAdvances_getPendingRequests,
  checkEligibility: cashAdvances_checkEligibility,
  requestByCashier: cashAdvances_requestByCashier,
  getPendingCount: cashAdvances_getPendingCount,
  getPendingTotal: cashAdvances_getPendingTotal
};

// ── Namespace: payroll ──
async function payroll_getPeriods() {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data || [];
    }

async function payroll_createPeriod(period: {
      period_start: string;
      period_end: string;
      pay_date?: string;
    }) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("payroll_periods")
        .insert([{ ...period, status: "draft", created_by: user.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function payroll_updatePeriod(id: string, updates: Record<string, any>) {
      const { data, error } = await supabase
        .from("payroll_periods")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function payroll_getAttendanceLogs(periodId: string) {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select(
          `
          *,
          employee:employee_id(
            id, employee_code, full_name, position,
            base_hourly_rate, holiday_rate_multiplier, overtime_rate_multiplier,
            sss_contribution, philhealth_contribution, hdmf_contribution
          )
        `,
        )
        .eq("payroll_period_id", periodId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    }

async function payroll_upsertAttendanceLog(log: {
      employee_id: string;
      payroll_period_id: string;
      worked_hours?: number;
      required_hours?: number;
      days_present?: number;
      late_timeslots?: number;
      early_leave_timeslots?: number;
      regular_overtime_hours?: number;
      holiday_overtime_hours?: number;
      special_overtime_hours?: number;
      business_trip_days?: number;
      absences?: number;
      on_leave_days?: number;
      additional_pay?: number;
      deduction_amount?: number;
    }) {
      const { data, error } = await supabase
        .from("attendance_logs")
        .upsert([{ ...log, updated_at: new Date().toISOString() }], {
          onConflict: "employee_id,payroll_period_id",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function payroll_getPayrollRecords(periodId: string) {
      const { data, error } = await supabase
        .from("payroll_records")
        .select(
          `
          *,
          employee:employee_id(id, employee_code, full_name, position)
        `,
        )
        .eq("payroll_period_id", periodId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    }

async function payroll_updatePayrollRecord(id: string, updates: Record<string, any>) {
      const { data, error } = await supabase
        .from("payroll_records")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

async function payroll_computePayroll(periodId: string) {
      // ── Fetch period dates — scopes all CA queries to this period only ──────
      const { data: periodRow } = await supabase
        .from("payroll_periods")
        .select("period_start, period_end")
        .eq("id", periodId)
        .single();
      const periodStart = periodRow?.period_start ?? "1970-01-01";
      const periodEnd = periodRow?.period_end ?? "2099-12-31";

      const { data: logs, error } = await supabase
        .from("attendance_logs")
        .select(
          `
          *,
          employee:employee_id(
            id, employee_code, base_hourly_rate,
            sss_contribution, philhealth_contribution, hdmf_contribution
          )
        `,
        )
        .eq("payroll_period_id", periodId);
      if (error) throw error;

      // ══════════════════════════════════════════════════════════════════════
      // BULK DATA FETCH — all queries run ONCE instead of per-employee
      // ══════════════════════════════════════════════════════════════════════
      const { data: allExceptionalHours } = await supabase
        .from("attendance_exceptional_logs")
        .select("employee_id, hours_counted")
        .eq("payroll_period_id", periodId);

      // FIX: filter approved CAs to those issued within THIS period's date range.
      // Previously fetched ALL approved CAs from all time — could pull in old
      // unprocessed advances from prior periods.
      const { data: allApprovedCAs } = await supabase
        .from("cash_advances")
        .select("id, employee_id, amount")
        .in("status", ["approved", "added_to_current_payroll"])
        .gte("date_issued", periodStart)
        .lte("date_issued", periodEnd);

      const { data: allDeductedCAs } = await supabase
        .from("cash_advances")
        .select("id, employee_id, amount")
        .eq("status", "deducted")
        .eq("payroll_period_id", periodId);

      // Fetch all periods to map their start dates for correct chronological sorting
      const { data: periods } = await supabase
        .from("payroll_periods")
        .select("id, period_start");
      
      const periodStartMap: Record<string, string> = {};
      (periods || []).forEach((p: any) => {
        periodStartMap[p.id] = p.period_start || "";
      });

      const { data: allPrevRecords } = await supabase
        .from("payroll_records")
        .select("employee_id, payroll_period_id, carry_over_deduction")
        .neq("payroll_period_id", periodId);

      const sortedPrevRecords = (allPrevRecords || [])
        .filter((r: any) => {
          const prevStart = periodStartMap[r.payroll_period_id] || "";
          return prevStart < periodStart; // Only include chronologically EARLIER periods
        })
        .sort((a: any, b: any) => {
          const dateA = periodStartMap[a.payroll_period_id] || "";
          const dateB = periodStartMap[b.payroll_period_id] || "";
          return dateB.localeCompare(dateA); // Newest calendar period first
        });

      // Group bulk data by employee_id for O(1) lookup inside the loop
      const exceptionalByEmp: Record<string, any[]> = {};
      (allExceptionalHours || []).forEach((r: any) => {
        if (!exceptionalByEmp[r.employee_id]) exceptionalByEmp[r.employee_id] = [];
        exceptionalByEmp[r.employee_id].push(r);
      });

      const approvedCAsByEmp: Record<string, any[]> = {};
      (allApprovedCAs || []).forEach((r: any) => {
        if (!approvedCAsByEmp[r.employee_id]) approvedCAsByEmp[r.employee_id] = [];
        approvedCAsByEmp[r.employee_id].push(r);
      });

      const deductedCAsByEmp: Record<string, any[]> = {};
      (allDeductedCAs || []).forEach((r: any) => {
        if (!deductedCAsByEmp[r.employee_id]) deductedCAsByEmp[r.employee_id] = [];
        deductedCAsByEmp[r.employee_id].push(r);
      });

      // For carry-over, take the most recent record per employee based on calendar dates
      const carryOverByEmp: Record<string, number> = {};
      sortedPrevRecords.forEach((r: any) => {
        if (!(r.employee_id in carryOverByEmp)) {
          carryOverByEmp[r.employee_id] = Number(r.carry_over_deduction) || 0;
        }
      });

      const results = [];
      const casToMarkDeducted: string[] = [];
      const payrollUpsertBatch: any[] = [];

      for (const log of logs || []) {
        const emp = log.employee;
        if (!emp) continue;

        // ────────────────────────────────────────────────────────────────────
        // BASE RATES
        // NOTE: base_hourly_rate column stores the DAILY rate, not hourly.
        // Hourly rate is derived for OT and tardy calculations.
        // ────────────────────────────────────────────────────────────────────
        const dailyRate = Number(emp.base_hourly_rate) || 0;
        const hourlyRate = dailyRate / 8;

        // ────────────────────────────────────────────────────────────────────
        // DAYS PRESENT
        // ────────────────────────────────────────────────────────────────────
        const empExceptional = exceptionalByEmp[emp.id] || [];

        const rawDays = Number(log.days_present) || (Number(log.worked_hours) > 0 ? Math.round(Number(log.worked_hours) / 8) : 0);
        const completeDays = Math.max(0, rawDays - empExceptional.length);
        const exceptionalDays = empExceptional.reduce((s: number, r: any) => s + (Number(r.hours_counted) || 0), 0) / 8;
        const daysPresent = completeDays + exceptionalDays;

        // ────────────────────────────────────────────────────────────────────
        // BASIC PAY
        // Formula: Daily Rate × Days Present
        // ────────────────────────────────────────────────────────────────────
        const basicPay = dailyRate * daysPresent;

        // ────────────────────────────────────────────────────────────────────
        // BUSINESS TRIP PAY
        // Formula: Daily Rate × Business Trip Days
        // ────────────────────────────────────────────────────────────────────
        const businessTripDays = Number(log.business_trip_days) || 0;
        const businessTripPay = dailyRate * businessTripDays;

        // ────────────────────────────────────────────────────────────────────
        // HOLIDAY PAY
        // TODO: Add regular_holiday_days and special_holiday_days columns to
        // attendance_logs for proper holiday-day tracking.
        // ────────────────────────────────────────────────────────────────────
        const regularHolidayPay = 0;
        const specialHolidayPay = 0;

        // ────────────────────────────────────────────────────────────────────
        // OVERTIME — PREMIUM ONLY
        //
        // The Excel stores OT as monetary premiums only (e.g. =455*0.3=136.50)
        // because basic pay already covers the base rate for those hours via
        // daysPresent. We use the same premium-only multipliers:
        //
        // Regular Day OT     +0.25 (Excel col G header: 0.25)
        // Regular Holiday OT +0.60 (Excel col H header: 0.60)
        // Special Holiday OT +0.30 (Excel col I header: 0.30)
        //
        // FIX: was 1.25/1.60/1.30 — those full-rate multipliers double-count
        // the base pay that is already in basicPay.
        // ────────────────────────────────────────────────────────────────────
        const regularOT =
          hourlyRate * 0.25 * Number(log.regular_overtime_hours || 0);
        const holidayOT =
          hourlyRate * 0.60 * Number(log.holiday_overtime_hours || 0);
        const specialOT =
          hourlyRate * 0.30 * Number(log.special_overtime_hours || 0);

        // ────────────────────────────────────────────────────────────────────
        // TARDY & UNDERTIME DEDUCTIONS
        // Formula: (Daily Rate ÷ 8) × 0.5 × timeslots (1 slot = 30 min)
        // These are subtracted from Gross Income (matching Excel formula).
        // ────────────────────────────────────────────────────────────────────
        const tardyDeductions =
          (dailyRate / 8 / 60) * Number(log.late_timeslots || 0);
        const undertimeDeductions =
          (dailyRate / 8 / 60) * Number(log.early_leave_timeslots || 0);

        // ────────────────────────────────────────────────────────────────────
        // GROSS INCOME  (matches Excel: K7 = C7×D7 + E7+F7+G7+H7+I7 − J7 − J9)
        // = Basic Pay + Business Trip Pay + Holiday Pay + OT Premiums
        //   + Additional Pay − Tardy − Undertime
        // ────────────────────────────────────────────────────────────────────
        const grossIncome =
          basicPay +
          businessTripPay +
          regularHolidayPay +
          specialHolidayPay +
          regularOT +
          holidayOT +
          specialOT +
          Number(log.additional_pay || 0) -
          tardyDeductions -
          undertimeDeductions;

        // (Tardy & Undertime are already subtracted from Gross Income above)

        // ────────────────────────────────────────────────────────────────────
        // PHILHEALTH
        // FIX: use per-employee contribution stored on the employee record.
        // Admin sets this manually to match the PhilHealth contribution table
        // for each employee's salary bracket.
        // Previously auto-calculated as (dailyRate × 26) × 3% ÷ 2, which
        // didn't match the manually-entered amounts in the payroll register.
        // ────────────────────────────────────────────────────────────────────
        const philhealth = Number(emp.philhealth_contribution) || 0;

        // ────────────────────────────────────────────────────────────────────
        // HDMF (PAG-IBIG)
        // FIX: use per-employee contribution — not a fixed ₱200.
        // Amounts vary: mandatory ₱100 + individual loan amortization if any.
        // Admin sets this in the employee record (Management → Employees).
        // ────────────────────────────────────────────────────────────────────
        const hdmf = Number(emp.hdmf_contribution) || 0;

        // ────────────────────────────────────────────────────────────────────
        // WITHHOLDING TAX
        // ₱0 for most employees (monthly equivalent below ₱20,833 threshold)
        // TODO: Implement BIR tax table brackets for higher earners
        // ────────────────────────────────────────────────────────────────────
        const withholdingTax = 0;

        // ────────────────────────────────────────────────────────────────────
        // SSS (SOCIAL SECURITY SYSTEM)
        // Fetched from employee record's manual sss_contribution field.
        // ────────────────────────────────────────────────────────────────────
        const sss = Number(emp.sss_contribution) || 0;

        // ────────────────────────────────────────────────────────────────────
        // CASH ADVANCE — SAME-PERIOD DEDUCTION
        //
        // CAs approved within this period's date range are deducted this period.
        // The CA query above is already filtered by periodStart/periodEnd so
        // old unprocessed advances from prior periods won't bleed in.
        // ────────────────────────────────────────────────────────────────────
        const MAX_ADVANCE = 2000;

        const newCAsToProcess = approvedCAsByEmp[emp.id] || [];
        const alreadyDeducted = deductedCAsByEmp[emp.id] || [];

        const alreadyDeductedAmount = alreadyDeducted.reduce(
          (s: number, a: any) => s + Number(a.amount), 0,
        );

        const newCAsAmount = newCAsToProcess.reduce(
          (s: number, a: any) => s + Number(a.amount), 0,
        );

        const cashAdvanceIssued = Math.min(
          newCAsAmount + alreadyDeductedAmount,
          MAX_ADVANCE,
        );

        // Deduction equals the issued amount — same period
        const cashAdvanceDeduction = cashAdvanceIssued;

        // Collect CA IDs to mark as deducted (batched after loop)
        newCAsToProcess.forEach((a: any) => casToMarkDeducted.push(a.id));

        const carryOverFromPrevious = carryOverByEmp[emp.id] || 0;

        // ────────────────────────────────────────────────────────────────────
        // TOTAL DEDUCTIONS
        // = Withholding Tax + CA + CarryOver + PhilHealth + HDMF + SSS
        // NOTE: Tardy/Undertime are NOT here — they reduce Gross Income.
        // ────────────────────────────────────────────────────────────────────
        const totalDeductions =
          withholdingTax +
          cashAdvanceDeduction +
          carryOverFromPrevious +
          philhealth +
          hdmf +
          sss;

        // ────────────────────────────────────────────────────────────────────
        // NET PAY
        // FIX: removed `+ cashAdvanceIssued` from gross.
        // CA is a pure deduction — the employee already received the cash.
        // Previously: netPayRaw = grossIncome + cashAdvanceIssued - totalDeductions
        // This caused CA to cancel itself out, so it never actually reduced
        // take-home pay. Matches the Excel formula: Net = Gross − Deductions.
        // cashAdvanceIssued is retained in the record for payslip display only.
        // ────────────────────────────────────────────────────────────────────
        const netPayRaw = grossIncome - totalDeductions;
        const netPay = Math.max(0, netPayRaw);
        const carryOver = netPayRaw < 0 ? Math.abs(netPayRaw) : 0;

        const taxableIncome = grossIncome - philhealth - hdmf;

        payrollUpsertBatch.push({
          payroll_period_id: periodId,
          employee_id: emp.id,
          daily_rate: dailyRate,
          days_present: daysPresent,
          basic_pay: basicPay,
          regular_holiday_pay: regularHolidayPay,
          special_holiday_pay: specialHolidayPay,
          regular_overtime: regularOT,
          holiday_overtime: holidayOT,
          special_overtime: specialOT,
          gross_income: grossIncome,
          tardy_deductions: tardyDeductions,
          undertime_deductions: undertimeDeductions,
          sss,
          philhealth,
          hdmf,
          withholding_tax: withholdingTax,
          cash_advance: cashAdvanceDeduction,
          cash_advance_issued: cashAdvanceIssued,
          total_deductions: totalDeductions,
          net_pay: netPay,
          taxable_income: taxableIncome,
          carry_over_deduction: carryOver,
          carry_over_from_previous: carryOverFromPrevious,
          status: "pending",
          updated_at: new Date().toISOString(),
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // BATCH WRITES
      // ══════════════════════════════════════════════════════════════════════
      if (casToMarkDeducted.length > 0) {
        await supabase
          .from("cash_advances")
          .update({
            status: "deducted",
            payroll_period_id: periodId,
            updated_at: new Date().toISOString(),
          })
          .in("id", casToMarkDeducted);
      }

      if (payrollUpsertBatch.length > 0) {
        const { data: saved, error: saveErr } = await supabase
          .from("payroll_records")
          .upsert(payrollUpsertBatch, { onConflict: "employee_id,payroll_period_id" })
          .select();

        if (saveErr) throw saveErr;
        results.push(...(saved || []));
      }

      return results;
    }

async function payroll_resetPayroll(periodId: string) {
      const { error: delErr } = await supabase
        .from("payroll_records")
        .delete()
        .eq("payroll_period_id", periodId);
      if (delErr) throw delErr;

      const { data: deductedCAs } = await supabase
        .from("cash_advances")
        .select("id")
        .eq("status", "deducted")
        .eq("payroll_period_id", periodId);
      if (deductedCAs && deductedCAs.length > 0) {
        await supabase
          .from("cash_advances")
          .update({
            status: "approved",
            payroll_period_id: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", (deductedCAs as any[]).map((a: any) => a.id));
      }

      const { data: issuedCAs } = await supabase
        .from("cash_advances")
        .select("id")
        .eq("status", "added_to_current_payroll")
        .eq("payroll_period_id", periodId);
      if (issuedCAs && issuedCAs.length > 0) {
        await supabase
          .from("cash_advances")
          .update({
            status: "approved",
            payroll_period_id: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", (issuedCAs as any[]).map((a: any) => a.id));
      }

      // ── Re-flag incomplete punches so they show up again ──
      // Reset has_incomplete_punch on attendance_logs based on exceptional logs
      const { data: exceptionalLogs } = await supabase
        .from("attendance_exceptional_logs")
        .select("employee_id, punch_date")
        .eq("payroll_period_id", periodId);

      if (exceptionalLogs && exceptionalLogs.length > 0) {
        // Mark all exceptional logs as incomplete again
        await supabase
          .from("attendance_exceptional_logs")
          .update({ is_incomplete: true })
          .eq("payroll_period_id", periodId);

        // Group by employee to get incomplete punch dates
        const byEmployee: Record<string, string[]> = {};
        exceptionalLogs.forEach((row: any) => {
          if (!byEmployee[row.employee_id]) byEmployee[row.employee_id] = [];
          byEmployee[row.employee_id].push(row.punch_date);
        });

        // Re-flag each employee's attendance log
        for (const [empId, dates] of Object.entries(byEmployee)) {
          await supabase
            .from("attendance_logs")
            .update({
              has_incomplete_punch: true,
              incomplete_punch_dates: dates,
            })
            .eq("payroll_period_id", periodId)
            .eq("employee_id", empId);
        }
      }

      return { success: true };
    }

async function payroll_deletePeriod(id: string) {
      const { data: period } = await supabase
        .from("payroll_periods")
        .select("status")
        .eq("id", id)
        .single();
      if (period?.status !== "draft")
        throw new Error("Only draft periods can be deleted.");

      await supabase
        .from("cash_advances")
        .update({
          status: "approved",
          payroll_period_id: null,
          updated_at: new Date().toISOString(),
        })
        .in("status", ["added_to_current_payroll", "deducted"])
        .eq("payroll_period_id", id);
      await supabase.from("payroll_records").delete().eq("payroll_period_id", id);
      await supabase.from("attendance_logs").delete().eq("payroll_period_id", id);
      await supabase.from("attendance_exceptional_logs").delete().eq("payroll_period_id", id);
      await supabase.from("attendance_summary_imports").delete().eq("payroll_period_id", id);

      const { error } = await supabase.from("payroll_periods").delete().eq("id", id);
      if (error) throw error;
    }

export const payroll = {
  getPeriods: payroll_getPeriods,
  createPeriod: payroll_createPeriod,
  updatePeriod: payroll_updatePeriod,
  getAttendanceLogs: payroll_getAttendanceLogs,
  upsertAttendanceLog: payroll_upsertAttendanceLog,
  getPayrollRecords: payroll_getPayrollRecords,
  updatePayrollRecord: payroll_updatePayrollRecord,
  computePayroll: payroll_computePayroll,
  resetPayroll: payroll_resetPayroll,
  deletePeriod: payroll_deletePeriod
};

export const payrollDb = {
  cashAdvances,
  payroll
};
