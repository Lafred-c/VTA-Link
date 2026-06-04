import { useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/config/supabaseClient';
import { adminDb } from '../services/adminDb';
import { authDb } from '@/modules/auth';
import { inventoryDb } from '@/modules/inventory';
import { adminApi } from '@/lib/adminApi';
import type {
  FrontendUser,
  FrontendSupplier,
  EmployeeRecord,
  AdminProduct,
  BOMItem,
  Material,
  UserRole,
  EmployeeRole,
} from '@/Types';
import { useQuery, safe } from '@/hooks/useSupabaseQuery';
import { fmtDate, parseDbDate } from '@/util/formatters';

// We import useOrders from the Operations module public API (or direct file if Operations isn't fully set up yet)
import { useOrders } from '@/modules/operations/hooks/useOperations';

// Mappers
function mapUser(raw: any): FrontendUser {
  return {
    id: raw.id,
    firstName: raw.first_name || '',
    lastName: raw.last_name || '',
    email: raw.email || '',
    role: raw.role ? raw.role.charAt(0).toUpperCase() + raw.role.slice(1) : 'Customer',
    contactNumber: raw.contact_number || '',
    isActive: raw.is_active ?? true,
    isSuki: !!raw.is_suki,
    createdAt: fmtDate(raw.created_at),
    lastSeenAt: raw.last_seen_at,
  };
}

function mapSupplier(raw: any): FrontendSupplier {
  return {
    id: raw.id,
    supplierName: raw.name || '',
    email: raw.email || '',
    contactNumber: raw.phone || '',
    address: raw.address || '',
    supplierStatus: raw.is_active ? 'Active' : 'Inactive',
    isFlagged: raw.is_flagged ?? false,
    flagCategory: raw.flag_category || 'None',
    flagNotes: raw.flag_notes || '',
    createdAt: parseDbDate(raw.created_at)?.toLocaleDateString() || '',
  };
}

function mapEmployee(raw: any): EmployeeRecord {
  return {
    id: raw.id,
    employeeCode: raw.employee_code || '',
    fullName: raw.full_name || '',
    position: raw.position || '',
    role: (raw.role ? raw.role.toLowerCase() : 'production') as UserRole,
    baseHourlyRate: Number(raw.base_hourly_rate) || 0,
    holidayRateMultiplier: Number(raw.holiday_rate_multiplier) || 2.0,
    overtimeRateMultiplier: Number(raw.overtime_rate_multiplier) || 1.5,
    hireDate: parseDbDate(raw.hire_date)?.toLocaleDateString() || '',
    isActive: raw.is_active ?? true,
    sssContribution: Number(raw.sss_contribution) || 0,
    philhealthContribution: Number(raw.philhealth_contribution) || 0,
    hdmfContribution: Number(raw.hdmf_contribution) || 0,
  };
}

function deriveMatStatus(item: any): string {
  if (!item.is_active) return 'Phased Out';
  const qty = Number(item.current_quantity), rp = Number(item.reorder_point);
  if (qty <= 0) return 'Restocking';
  if (qty <= rp) return 'Low Stock';
  return 'Available';
}

function mapMaterial(item: any): Material {
  const pref =
    item.item_suppliers?.find((s: any) => s.is_preferred) ??
    item.item_suppliers?.[0];
  const mappedSuppliers =
    item.item_suppliers
      ?.map((s: any) => ({
        id: s.suppliers?.id,
        name: s.suppliers?.name,
        flagCategory: s.suppliers?.flag_category,
      }))
      .filter((s: any) => s.id) || [];

  return {
    id: item.id,
    itemType: item.name,
    itemVariant: item.description || "",
    usableStocks: Number(item.current_quantity),
    stockUnit: item.unit_of_measure,
    reorderPoint: Number(item.reorder_point),
    unitCost: Number(item.unit_cost),
    purchaseQty: Number(item.conversion_rate ?? 1),
    purchaseUnit: item.purchase_unit || item.unit_of_measure,
    supplier: pref?.suppliers?.name || "—",
    status: deriveMatStatus(item) as any,
    isActive: item.is_active,
    description: item.description,
    lastSupplierCost: pref ? Number(pref.supplier_unit_price) : undefined,
    mappedSuppliers,
  };
}

function mapAdminProduct(raw: any): AdminProduct {
  const bom: BOMItem[] = (raw.product_supply_mapping || []).map((m: any) => ({
    id: m.id,
    inventoryItemId: m.inventory_item_id,
    materialName: m.inventory_items?.name || '—',
    quantityRequired: Number(m.quantity_required),
    unitOfMeasure: m.inventory_items?.unit_of_measure || '',
    unitCost: Number(m.inventory_items?.unit_cost) || 0,
    conversionRate: Number(m.inventory_items?.conversion_rate) || 1,
  }));
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category || '',
    variant: raw.variant || '',
    sizeSpec: raw.size_spec || '',
    materialCost: Number(raw.material_cost) || 0,
    profitFee: Number(raw.profit_fee) || 0,
    finalPrice: Number(raw.final_price) || 0,
    isActive: raw.is_active ?? true,
    description: raw.description || '',
    bom,
  };
}

// Log formatting helpers
function fmtLogDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
}

function fmtLogUser(user: any, fallback = 'System'): string {
  if (!user) return fallback;
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  if (!name) return fallback;
  const role = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '';
  return role ? `${name} (${role})` : name;
}

function humanizeField(field: string): string {
  const map: Record<string, string> = {
    first_name: 'First Name', last_name: 'Last Name', contact_number: 'Phone',
    is_active: 'Active Status', is_suki: 'Suki Status', full_name: 'Full Name',
    base_hourly_rate: 'Hourly Rate', hire_date: 'Hire Date',
    unit_of_measure: 'Unit', current_quantity: 'Stock Quantity',
    reorder_point: 'Reorder Point', unit_cost: 'Unit Cost',
    purchase_unit: 'Purchase Unit', conversion_rate: 'Conversion Rate',
    material_cost: 'Material Cost', profit_fee: 'Profit Fee',
    final_price: 'Final Price', size_spec: 'Size/Spec',
    total_amount: 'Total Amount', amount_paid: 'Amount Paid',
    payment_status: 'Payment Status', order_type: 'Order Type',
    special_instructions: 'Instructions', due_date: 'Due Date',
    assigned_designer: 'Designer', assigned_production: 'Production Staff',
    is_flagged: 'Flagged', flag_category: 'Flag Category', flag_notes: 'Flag Notes',
    philhealth_contribution: 'PhilHealth', hdmf_contribution: 'HDMF/Pag-IBIG',
    holiday_rate_multiplier: 'Holiday Rate', overtime_rate_multiplier: 'OT Rate',
  };
  return map[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function humanizeStatus(status: string): string {
  const map: Record<string, string> = {
    in_queue: 'In Queue', designing: 'Designing', payment: 'Awaiting Payment',
    production: 'In Production', pickup: 'Ready for Pickup', completed: 'Completed',
    cancelled: 'Cancelled', cancel_requested: 'Cancellation Requested',
  };
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Hooks
export function useMyProfile() {
  const q = useQuery(async () => { return await authDb.getMyProfile(); }, ['my-profile'], ['users']);

  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        adminDb.updateLastSeen();
      }
    };
    const interval = setInterval(heartbeat, 120000);
    heartbeat();
    return () => clearInterval(interval);
  }, []);
  return { profile: q.data, ...q };
}

export function useUsers(filters?: { role?: string; status?: string }) {
  const q = useQuery(() => adminDb.getUsers(filters), [filters?.role, filters?.status], ['users']);
  return { users: q.data || [], ...q };
}

export function useEmployees() {
  const q = useQuery(() => adminDb.getEmployees(), [], ['employees']);
  return { employees: q.data || [], ...q };
}

export function useSuppliers() {
  const q = useQuery(() => inventoryDb.getSuppliers(), [], ['suppliers']);
  return { suppliers: q.data || [], ...q };
}

export function useProducts(filters?: { search?: string; category?: string }) {
  const q = useQuery(() => inventoryDb.getProducts(filters), [filters?.search, filters?.category], ['products']);
  return { products: q.data || [], ...q };
}

export function useManagementData() {
  const { users: rawUsers, refresh: refreshUsers } = useUsers();
  const { employees: rawEmps, refresh: refreshEmps } = useEmployees();
  const { suppliers: rawSups, refresh: refreshSups } = useSuppliers();
  const users = rawUsers.map(mapUser);
  const employees = rawEmps.map(mapEmployee);
  const suppliers = rawSups.map(mapSupplier);
  return {
    users, employees, suppliers, loading: false,
    createUser: async (data: { firstName: string; lastName: string; email: string; password: string; role: string; phoneNumber?: string }) => { const r = await safe(() => adminApi.createUser({ email: data.email, password: data.password, role: data.role.toLowerCase(), first_name: data.firstName, last_name: data.lastName, contact_number: data.phoneNumber }).then(() => refreshUsers())); return r; },
    updateUser: async (id: string, data: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string; role?: string }) => { const r = await safe(() => adminApi.updateUser(id, { first_name: data.firstName, last_name: data.lastName, email: data.email, contact_number: data.phoneNumber, role: data.role?.toLowerCase() }).then(() => refreshUsers())); return r; },
    deactivateUsers: async (ids: string[]) => { const r = await safe(() => adminApi.deactivateUsers(ids).then(() => refreshUsers())); return r; },
    createEmployee: async (data: { employeeCode?: string; fullName: string; position: string; role?: EmployeeRole; baseHourlyRate?: number; hireDate?: string }) => { const r = await safe(() => adminDb.createEmployee({ employee_code: data.employeeCode, full_name: data.fullName, position: data.position, role: data.role as any, base_hourly_rate: data.baseHourlyRate, hire_date: data.hireDate }).then(() => refreshEmps())); return r; },
    updateEmployee: async (id: string, data: { fullName?: string; position?: string; role?: string; baseHourlyRate?: number; holidayMultiplier?: number; overtimeMultiplier?: number }) => {
      const updates: Record<string, any> = {};
      if (data.role !== undefined) updates.role = data.role;
      if (data.fullName !== undefined) updates.full_name = data.fullName;
      if (data.position !== undefined) updates.position = data.position;
      if (data.baseHourlyRate !== undefined) updates.base_hourly_rate = data.baseHourlyRate;
      if (data.holidayMultiplier !== undefined) updates.holiday_rate_multiplier = data.holidayMultiplier;
      if (data.overtimeMultiplier !== undefined) updates.overtime_rate_multiplier = data.overtimeMultiplier;
      const r = await safe(() => adminDb.updateEmployee(id, updates).then(() => refreshEmps()));
      return r;
    },
    deactivateEmployee: async (id: string) => { const r = await safe(() => adminDb.updateEmployee(id, { is_active: false }).then(() => refreshEmps())); return r; },
    createSupplier: async (data: { name: string; phone?: string; email?: string; address?: string }) => {
      const r = await safe(() => inventoryDb.createSupplier({ name: data.name, phone: data.phone, email: data.email, address: data.address }).then(() => refreshSups()));
      return r;
    },
    updateSupplier: async (id: string, updates: Record<string, any>) => { const r = await safe(() => inventoryDb.updateSupplier(id, updates).then(() => refreshSups())); return r; },
    flagSupplier: async (id: string, flagged: boolean, category: string, notes?: string) => { const r = await safe(() => inventoryDb.updateSupplier(id, { is_flagged: flagged, flag_category: category, flag_notes: notes || '' }).then(() => refreshSups())); return r; },
    toggleSupplierActive: async (id: string, active: boolean) => { const r = await safe(() => inventoryDb.updateSupplier(id, { is_active: active }).then(() => refreshSups())); return r; },
    getSupplierMaterials: async (supplierId: string) => {
      return await inventoryDb.getSupplierMaterials(supplierId);
    },
    updateSupplierMaterials: async (supplierId: string, inventoryItemIds: string[]) => {
      const r = await safe(() =>
        inventoryDb.updateSupplierMaterials(supplierId, inventoryItemIds).then(() => refreshSups()),
      );
      return r;
    },
    toggleSuki: async (id: string, isSuki: boolean) => { const r = await safe(() => adminApi.toggleSuki(id, isSuki).then(() => refreshUsers())); return r; },
  };
}

export function useDashboard() {
  const { orders, stats: orderStats, refresh: refreshOrders } = useOrders();
  const { data: inventory, refresh: refreshInv } = useQuery(() => inventoryDb.getInventoryItems(), [], ['inventory_items', 'item_suppliers', 'suppliers']);
  const items = inventory || [];
  const invStats = {
    total: items.length,
    available: items.filter((i: any) => Number(i.current_quantity) > Number(i.reorder_point)).length,
    lowStock: items.filter((i: any) => Number(i.current_quantity) > 0 && Number(i.current_quantity) <= Number(i.reorder_point)).length,
    restocking: items.filter((i: any) => Number(i.current_quantity) <= 0).length,
    phasedOut: items.filter((i: any) => !i.is_active).length,
  };
  const lowStockItems = items.filter((i: any) => Number(i.current_quantity) > 0 && Number(i.current_quantity) <= Number(i.reorder_point)).map((i: any) => ({ id: i.id, name: i.name, currentQty: Number(i.current_quantity), reorderPoint: Number(i.reorder_point), unit: i.unit_of_measure }));
  const recentOrders = orders.slice(0, 5).map((o: any) => { return { id: o.id, orderId: o.orderId, customerName: o.customerName, product: o.productType || 'Multiple', amount: Number(o.totalAmount) || 0, status: o.status, date: o.dateOrdered }; });
  const totalRevenue = orders.reduce((s: number, o: any) => s + (Number(o.totalAmount) || 0), 0);
  const totalCollected = orders.reduce((s: number, o: any) => s + (Number(o.amountPaid) || 0), 0);
  const extendedOrderStats = { ...orderStats, totalRevenue, totalCollected, unpaid: orderStats.pendingPayment };
  const refresh = useCallback(async () => { await Promise.all([refreshOrders(), refreshInv()]); }, [refreshOrders, refreshInv]);
  return { orders, orderStats: extendedOrderStats, invStats, lowStockItems, recentOrders, loading: false, refresh };
}

export function useDashboardData() {
  const { orders, orderStats, invStats, lowStockItems, recentOrders, loading, refresh } = useDashboard();
  return { data: { rawOrders: orders, orderStats, inventoryStats: invStats, lowStockItems, recentOrders }, loading, refresh };
}

export function useProductsData(filters?: { search?: string; category?: string }) {
  const q = useQuery(() => inventoryDb.getProductsWithBOM(filters), [filters?.search, filters?.category], ['products', 'product_supply_mapping', 'inventory_items']);
  const { data: rawMaterials } = useQuery(() => inventoryDb.getInventoryItems(), [], ['inventory_items', 'item_suppliers', 'suppliers']);
  const raw = q.data || [];
  const products: AdminProduct[] = raw.map(mapAdminProduct);
  const materials: Material[] = (rawMaterials || []).filter((m: any) => m.is_active).map(mapMaterial);
  const stats = { total: products.length, active: products.filter(p => p.isActive).length, inactive: products.filter(p => !p.isActive).length };
  return {
    products, stats, materials, loading: q.loading, error: q.error, refresh: q.refresh,
    createProduct: async (product: { name: string; category?: string; variant?: string; size_spec?: string; material_cost: number; profit_fee: number; final_price: number; description?: string }, bom: { inventory_item_id: string; quantity_required: number }[]) => { const r = await safe(() => inventoryDb.createProductWithBOM(product, bom).then(() => q.refresh())); return r; },
    updateProduct: async (id: string, product: Record<string, any>, bom?: { inventory_item_id: string; quantity_required: number }[]) => { const r = await safe(() => inventoryDb.updateProductWithBOM(id, product, bom).then(() => q.refresh())); return r; },
    deleteProduct: async (id: string) => { const r = await safe(() => inventoryDb.deleteProduct(id).then(() => q.refresh())); return r; },
  };
}

function fmtLogPeso(v: number | undefined | null): string {
  const val = Number(v) || 0;
  return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function useLogsData() {
  const q = useQuery(async () => {
    const [ordersRes, invRes, auditRes] = await Promise.all([
      supabase.from('order_logs').select(`*, updated_by_user:updated_by(id, first_name, last_name, role)`).order('created_at', { ascending: false }).limit(200),
      supabase.from('inventory_changes').select(`*, changed_by_user:changed_by(id, first_name, last_name, role), item:inventory_item_id(name)`).order('created_at', { ascending: false }).limit(200),
      supabase.from('audit_logs').select(`*, actor_user:actor_id(id, first_name, last_name, role)`).order('created_at', { ascending: false }).limit(200)
    ]);
    return { orders: ordersRes.data || [], inventory: invRes.data || [], audit: auditRes.data || [] };
  }, [], ['order_logs', 'inventory_changes', 'audit_logs']);

  const logs = useMemo(() => {
    if (!q.data) return [];
    const combined: any[] = [];

    // Order Logs
    q.data.orders.forEach((raw: any) => {
      const statusLabel = raw.status ? humanizeStatus(raw.status) : '';
      const action = statusLabel ? `Order moved to "${statusLabel}"` : 'Order Updated';
      const note = raw.note ? ` — ${raw.note}` : '';
      const details = `Order #${raw.order_id?.slice(0, 8) || 'Unknown'}${note}`;

      combined.push({
        id: raw.id,
        module: 'orders',
        action,
        details,
        user: fmtLogUser(raw.updated_by_user, 'Customer / System'),
        role: raw.updated_by_user?.role || 'customer',
        createdAt: fmtLogDate(raw.created_at),
        timestamp: raw.created_at ? new Date(raw.created_at).getTime() : 0,
      });
    });

    // Inventory Changes
    q.data.inventory.forEach((raw: any) => {
      const itemName = raw.item?.name || 'Unknown item';
      const qtyChange = Number(raw.quantity_change) || 0;
      const direction = qtyChange >= 0 ? 'increased' : 'reduced';
      const absQty = Math.abs(qtyChange);
      const reason = raw.reason
        ? raw.reason.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : 'Manual adjustment';
      const changeType = raw.change_type
        ? raw.change_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : 'Stock Changed';

      combined.push({
        id: raw.id,
        module: 'inventory',
        action: changeType,
        details: `${itemName}: stock ${direction} by ${absQty}. Reason: ${reason}`,
        user: fmtLogUser(raw.changed_by_user),
        role: raw.changed_by_user?.role || 'system',
        createdAt: fmtLogDate(raw.created_at),
        timestamp: raw.created_at ? new Date(raw.created_at).getTime() : 0,
      });
    });

    // Audit Logs
    q.data.audit.forEach((raw: any) => {
      let details = '';
      const m = raw.metadata || {};

      switch (raw.action) {
        case 'Update Inventory': {
          const name = m.after?.name || m.before?.name || 'Item';
          const fields = (m.changed_fields || []).map(humanizeField);
          details = `Updated "${name}": ${fields.length > 0 ? fields.join(', ') : 'details'} changed.`;
          break;
        }
        case 'Create Inventory': {
          const name = m.after?.name || 'Item';
          details = `Created inventory item "${name}".`;
          break;
        }
        case 'Deactivate Inventory': {
          const name = m.before?.name || 'Item';
          details = `Deactivated inventory item "${name}".`;
          break;
        }
        case 'Create Product': {
          const name = m.after?.name || 'Product';
          details = `Created product template "${name}".`;
          break;
        }
        case 'Update Product': {
          const name = m.after?.name || m.before?.name || 'Product';
          const fields = (m.changed_fields || []).map(humanizeField);
          details = `Updated product template "${name}": ${fields.length > 0 ? fields.join(', ') : 'details'} changed.`;
          break;
        }
        case 'Delete Product': {
          const name = m.before?.name || 'Product';
          details = `Deleted product template "${name}".`;
          break;
        }
        case 'Record Payment': {
          const num = m.order_number || 'Unknown';
          const amt = fmtLogPeso(m.payment_amount);
          details = `Recorded payment of ${amt} for Order #${num}.`;
          break;
        }
        case 'Approve Payment': {
          const num = m.order_number || 'Unknown';
          const amt = fmtLogPeso(m.payment_amount);
          details = `Approved payment of ${amt} for Order #${num}.`;
          break;
        }
        case 'Decline Payment': {
          const num = m.order_number || 'Unknown';
          const amt = fmtLogPeso(m.payment_amount);
          details = `Declined payment of ${amt} for Order #${num}. Reason: ${m.reason || '—'}`;
          break;
        }
        case 'Request Cancellation': {
          const num = m.order_number || 'Unknown';
          details = `Cancellation request submitted for Order #${num}. Reason: ${m.reason || '—'}`;
          break;
        }
        case 'Approve Cancellation': {
          const num = m.order_number || 'Unknown';
          details = `Approved cancellation for Order #${num}. Note: ${m.note || '—'}`;
          break;
        }
        case 'Decline Cancellation': {
          const num = m.order_number || 'Unknown';
          details = `Declined cancellation for Order #${num}. Note: ${m.note || '—'}`;
          break;
        }
        case 'Add SSS Contribution': {
          const name = m.employee_name || 'Employee';
          const amt = fmtLogPeso(m.sss_contribution);
          details = `Added SSS contribution of ${amt} to ${name}.`;
          break;
        }
        case 'Change SSS Contribution': {
          const name = m.employee_name || 'Employee';
          const amt = fmtLogPeso(m.sss_contribution);
          details = `Updated SSS contribution of ${name} to ${amt}.`;
          break;
        }
        default:
          details = `${raw.action} on ${raw.module}`;
      }

      combined.push({
        id: raw.id,
        module: 'audit',
        action: raw.action || 'System Action',
        details,
        user: fmtLogUser(raw.actor_user),
        role: raw.actor_user?.role || 'system',
        createdAt: fmtLogDate(raw.created_at),
        timestamp: raw.created_at ? new Date(raw.created_at).getTime() : 0,
      });
    });

    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [q.data]);

  return { logs, loading: q.loading, error: q.error, refresh: q.refresh };
}
