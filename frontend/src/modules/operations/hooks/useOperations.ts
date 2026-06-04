import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/config/supabaseClient';
import type { CashAdvanceEligibility } from '../operations.types';
import { useQuery, safe } from '@/hooks/useSupabaseQuery';
import { mapOrder } from '../operations.utils';
import { orderDb } from '../services/orderDb';
import { cashierDb } from '../services/cashierDb';
import { designerDb } from '../services/designerDb';
import { productionDb } from '../services/productionDb';
import { paymentDb } from '../services/paymentDb';
import { adminDb } from '@/modules/admin/services/adminDb';
import { cashAdvances } from '@/modules/payroll';
import { chat } from '@/modules/crm/services/crmDb';

const db = {
  ...orderDb,
  ...cashierDb,
  ...designerDb,
  ...productionDb,
  ...paymentDb,
  ...adminDb,
  cashAdvances,
  chat,
};



// Hooks
export function useOrders(filters?: { status?: string; assigned_designer?: string; assigned_production?: string }) {
  const { data: rawOrders, loading, error, refresh } = useQuery(
    () => db.getOrders(filters),
    ['orders', filters?.status, filters?.assigned_designer, filters?.assigned_production],
    ['orders', 'order_items', 'payments']
  );
  const { data: staffList } = useQuery(() => db.getStaffList(), [], ['employees', 'users']);

  const orders = rawOrders || [];
  const staff = (staffList || []).map((s: any) => ({
    id: s.id,
    firstName: s.first_name || '',
    lastName: s.last_name || '',
    role: s.role,
    lastSeenAt: s.last_seen_at,
  }));

  const now = new Date();
  const stats = {
    total: orders.length,
    inQueue: orders.filter((o: any) => o.status === 'in_queue').length,
    designing: orders.filter((o: any) => o.status === 'designing').length,
    payment: orders.filter((o: any) => o.status === 'payment').length,
    production: orders.filter((o: any) => o.status === 'production').length,
    pickup: orders.filter((o: any) => o.status === 'pickup').length,
    completed: orders.filter((o: any) => o.status === 'completed' && o.payment_status === 'paid').length,
    overdue: orders.filter((o: any) => o.due_date && new Date(o.due_date) < now && !['completed', 'cancelled', 'pickup'].includes(o.status)).length,
    pendingPayment: orders.filter((o: any) => o.payment_status !== 'paid' && o.status !== 'cancelled').length,
    completedUnpaid: orders.filter((o: any) => o.payment_status !== 'paid' && o.status === 'completed').length,
    readyPickup: orders.filter((o: any) => o.status === 'pickup').length,
    unassigned: orders.filter((o: any) => o.status === 'in_queue' && !o.assigned_designer).length,
  };

  return { orders: orders.map(mapOrder), stats, staff, loading, error, refresh };
}

export function useOrdersData(filters?: { status?: string; assigned_designer?: string; assigned_production?: string }) {
  const queryClient = useQueryClient();
  const { orders, stats, staff, loading: ordersLoading, error, refresh: ordersRefresh } = useOrders(filters);
  const { data: rawEmployees, loading: empLoading, refresh: empRefresh } = useQuery(
    () => adminDb.getEmployees(),
    [],
    ['employees'],
  );
  const employees = (rawEmployees || []).map((e: any) => ({
    id: e.id,
    fullName: e.full_name || '',
    role: e.role || '',
    position: e.position || '',
  }));

  const loading = ordersLoading || empLoading;
  const refresh = async () => { await Promise.all([ordersRefresh(), empRefresh()]); };

  const staffList = staff;
  const designers = staff.filter((s: any) => s.role === 'designer').map((s: any) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`.trim(),
    lastSeenAt: s.lastSeenAt,
  }));

  const productionStaff = employees
    .filter((e: any) => e.role?.toLowerCase() === 'production' || e.position?.toLowerCase().includes('production'))
    .map((e: any) => ({ id: e.id, name: e.fullName }));

  // Auto-dispatch algorithm
  useEffect(() => {
    if (loading || !orders.length || !designers.length) return;

    const unassigned = orders.filter(o => o.status === "In Queue" && !o.assignedDesigner);
    if (unassigned.length === 0) return;

    const dispatchNext = async () => {
      const now = new Date();
      for (const order of unassigned) {
        const loads = designers.map(d => {
          const loadCount = orders.filter(o => o.assignedDesigner === d.id && (o.status === "In Queue" || o.status === "Designing")).length;
          const hasRejected = order.rejectedByDesigners?.includes(d.id);

          const lastSeenAt = d.lastSeenAt;
          let isOnline = false;
          if (lastSeenAt) {
            const lastSeenDate = new Date(lastSeenAt);
            const diffMs = now.getTime() - lastSeenDate.getTime();
            isOnline = diffMs < 900000; // 15 mins
          }

          return { id: d.id, load: loadCount, hasRejected, isOnline };
        });

        const candidates = loads
          .filter(c => c.isOnline && !c.hasRejected)
          .sort((a, b) => a.load - b.load);

        if (candidates.length > 0) {
          await db.assignDesignerForAcceptance(order.id, candidates[0].id);
        } else {
          try {
            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('related_id', order.id)
              .eq('title', 'No Online Designers Available')
              .limit(1);

            if (!existingNotif || existingNotif.length === 0) {
              await db.notifyRoles(
                ['admin'],
                'No Online Designers Available',
                `Order ${order.orderId} has been tagged as Unassigned because there are no more online designers available to accept it.`,
                'orders',
                order.id
              );
            }
          } catch (notifErr) {
            console.error("Failed to check or send unassigned admin notification:", notifErr);
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      refresh();
    };

    dispatchNext();
  }, [orders, designers, loading, queryClient, refresh]);

  // Suki auto-bypass for payment status
  useEffect(() => {
    if (loading || !orders.length) return;

    const sukiInPayment = orders.filter(o => o.status === "Payment" && o.isSuki);
    if (sukiInPayment.length === 0) return;

    const bypassPayment = async () => {
      for (const order of sukiInPayment) {
        console.log(`Automatically bypassing payment for Suki order: ${order.orderId}`);
        try {
          await db.updateOrder(order.id, { status: "production" });
          if (order.customerId) {
            try {
              await db.chat.sendMessage(
                order.customerId,
                "Your order has automatically bypassed the payment confirmation phase because you are tagged as a SUKI customer, and it is now in the Production phase.",
                order.id
              );
            } catch (msgErr) {
              console.warn("Auto-bypass chat notification failed:", msgErr);
            }
          }
        } catch (err) {
          console.error(`Failed to auto-bypass payment for order ${order.orderId}:`, err);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      refresh();
    };

    bypassPayment();
  }, [orders, loading, queryClient, refresh]);

  return {
    orders, stats, staffList, designers, productionStaff, loading, error, refresh,
    createOrder: async (data: { customer_id?: string | null; guest_name?: string | null; guest_phone?: string | null; guest_email?: string | null; order_type: string; items: { product_id?: string; product_name: string; quantity: number; unit_price: number; specifications?: string; file_url?: string }[]; special_instructions?: string; due_date?: string; assigned_designer?: string | null; assigned_production?: string | null; comments?: string | null }) => {
      const r = await safe(() => db.createOrder({ ...data, assigned_designer: data.assigned_designer || undefined, assigned_production: data.assigned_production || undefined, comments: data.comments || undefined, customer_id: data.customer_id || undefined, guest_name: data.guest_name || undefined, guest_phone: data.guest_phone || undefined, guest_email: data.guest_email || undefined }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    updateStatus: async (orderId: string, status: string, excessUsage?: Record<string, number>) => {
      const dbStatus = status.toLowerCase().replace(/ /g, '_');
      const r = await safe(async () => {
        await db.updateOrder(orderId, { status: dbStatus });
        if (dbStatus === 'pickup') {
          try { await db.deductInventoryForOrder(orderId, excessUsage); } catch (invErr) { console.error("Inventory deduction failed:", invErr); }
        }
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        await refresh();
      });
      return r;
    },
    getOrderBOM: async (orderId: string) => { return await db.getOrderBOM(orderId); },
    assignStaff: async (orderId: string, assignment: { assigned_designer?: string; assigned_production?: string }) => {
      const r = await safe(async () => {
        const hasDesigner = !!assignment.assigned_designer;
        const hasProduction = !!assignment.assigned_production;
        if (hasDesigner && !hasProduction) {
          await db.assignDesignerForAcceptance(orderId, assignment.assigned_designer!);
        } else {
          await db.updateOrder(orderId, assignment);
        }
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        await refresh();
      });
      return r;
    },
    deleteOrder: async (orderId: string) => {
      const r = await safe(() => db.deleteOrder(orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    recordPayment: async (orderId: string, payment: { amount: number; payment_method: string; reference_number?: string; notes?: string }) => {
      const r = await safe(() => db.recordPayment(orderId, payment).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    approvePayment: async (paymentId: string, orderId: string) => {
      const r = await safe(() => db.approvePayment(paymentId, orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    declinePayment: async (paymentId: string, orderId: string, reason: string) => {
      const r = await safe(() => db.declinePayment(paymentId, orderId, reason).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    markDeclineAsRead: async (orderId: string) => {
      const r = await safe(() => db.markDeclineAsRead(orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    selfAssign: async (orderId: string) => {
      const r = await safe(async () => {
        await db.designerSelfPickOrder(orderId);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        await refresh();
      });
      return r;
    },
    updateCustomerDesign: async (orderId: string, url: string) => {
      const r = await safe(() => db.updateCustomerDesign(orderId, url).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    updateFinalDesign: async (orderId: string, url: string) => {
      const r = await safe(() => db.submitFinalDesign(orderId, url).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    acceptAssignedDesignOrder: async (orderId: string) => {
      const r = await safe(() => db.designerAcceptAssignedOrder(orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    rejectAssignedDesignOrder: async (orderId: string) => {
      const r = await safe(() => db.designerRejectAssignedOrder(orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    approveOrderDesign: async (orderId: string) => {
      const r = await safe(() => db.approveOrderDesign(orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    updateDesignerOrderDetails: async (orderId: string, updates: { totalAmount?: number; dueDate?: string }) => {
      const payload: { total_amount?: number; due_date?: string } = {};
      if (updates.totalAmount !== undefined) payload.total_amount = updates.totalAmount;
      if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
      const r = await safe(() => db.updateDesignerOrderDetails(orderId, payload).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    requestCancellation: async (orderId: string, reason: string) => {
      const r = await safe(() => db.requestCancellation(orderId, reason).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
    handleCancellationRequest: async (orderId: string, approve: boolean, designerNote?: string) => {
      const r = await safe(() => db.handleCancellationRequest(orderId, approve, designerNote).then(() => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        refresh();
      }));
      return r;
    },
  };
}

export function useCashierCashAdvances() {
  const q = useQuery(() => db.cashAdvances.getPendingCount(), []);
  return {
    pendingCount: q.data ?? 0,
    loading: q.loading,
    refresh: q.refresh,
    checkEligibility: async (employeeId: string, customDate?: string): Promise<CashAdvanceEligibility> => {
      try { return await db.cashAdvances.checkEligibility(employeeId, customDate); }
      catch { return { eligible: false, reason: 'limit_reached', remaining: 0, totalUsed: 0 }; }
    },
    submitRequest: async (data: { employee_id: string; amount: number; date_issued?: string; reason?: string }) => {
      const r = await safe(() => db.cashAdvances.requestByCashier(data).then(() => q.refresh()));
      return r;
    },
  };
}

