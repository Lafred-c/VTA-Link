import { inventoryDb as db } from '../services/inventoryDb';;
import { adminDb } from '@/modules/admin';
import type { Material, MaterialStatus, Delivery, DeliveryStatus } from '@/Types';
import { useQuery, safe } from '@/hooks/useSupabaseQuery';
import { fmtDate } from '@/util/formatters';

// Helpers
function deriveMatStatus(item: any): MaterialStatus {
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
    status: deriveMatStatus(item),
    isActive: item.is_active,
    description: item.description,
    lastSupplierCost: pref ? Number(pref.supplier_unit_price) : undefined,
    mappedSuppliers,
  };
}

function mapDelivery(raw: any): Delivery {
  const req = raw.requester;
  return {
    id: raw.id,
    inventoryItemId: raw.inventory_item_id,
    materialName: raw.inventory_item?.name || '—',
    materialUnit: raw.inventory_item?.purchase_unit || raw.inventory_item?.unit_of_measure || '',
    supplierId: raw.supplier_id,
    supplierName: raw.supplier?.name || '—',
    requestedBy: raw.requested_by,
    requestedByName: req ? `${req.first_name || ''} ${req.last_name || ''}`.trim() : '—',
    requestedQuantity: Number(raw.requested_quantity),
    expectedArrivalDate: raw.expected_arrival_date || '',
    status: raw.status as DeliveryStatus,
    receivedQuantity: Number(raw.received_quantity) || 0,
    receiptReferenceNumber: raw.receipt_reference_number || '',
    receivedDate: fmtDate(raw.received_date),
    notes: raw.notes || '',
    createdAt: fmtDate(raw.created_at),
  };
}

// Hooks
export function useInventoryData() {
  const q = useQuery(() => db.getInventoryItems(), [], ['inventory_items', 'item_suppliers', 'suppliers']);
  const raw = q.data || [];
  const materials: Material[] = raw.map(mapMaterial);
  const stats = {
    total: raw.length,
    available: raw.filter((i: any) => Number(i.current_quantity) > Number(i.reorder_point)).length,
    lowStock: raw.filter((i: any) => Number(i.current_quantity) > 0 && Number(i.current_quantity) <= Number(i.reorder_point)).length,
    restocking: raw.filter((i: any) => Number(i.current_quantity) <= 0).length,
    phasedOut: raw.filter((i: any) => !i.is_active).length,
  };
  return {
    materials, stats, loading: q.loading, error: q.error, refresh: q.refresh,
    updateMaterial: async (id: string, updates: any) => {
      const r = await safe(() => db.updateInventoryItem(id, updates).then(() => q.refresh()));
      return r;
    },
    updateMaterialSuppliers: async (materialId: string, supplierIds: string[]) => {
      const r = await safe(() =>
        db.updateMaterialSuppliers(materialId, supplierIds).then(() => q.refresh()),
      );
      return r;
    },
  };
}

export function useDeliveries() {
  const q = useQuery(() => db.getDeliveries(), [], ['deliveries', 'inventory_items', 'suppliers']);
  const { data: rawMaterials } = useQuery(() => db.getInventoryItems(), [], ['inventory_items']);
  const { data: rawSuppliers } = useQuery(() => db.getSuppliers(), [], ['suppliers']);
  const { data: staffList } = useQuery(() => adminDb.getStaffList(), [], ['users']);
  const { data: rawEmployees } = useQuery(() => adminDb.getEmployees(), [], ['employees']);

  const raw = q.data || [];
  const deliveries: Delivery[] = raw.map(mapDelivery);
  const materials = (rawMaterials || []).filter((m: any) => m.is_active);
  const suppliers = (rawSuppliers || []).filter((s: any) => s.is_active);

  const staff = (staffList || []).map((s: any) => ({
    id: s.id, firstName: s.first_name || '', lastName: s.last_name || '', role: s.role,
  }));

  const employees = (rawEmployees || []).map((e: any) => ({
    id: e.id,
    fullName: e.full_name,
    role: e.role,
    position: e.position
  }));

  const stats = {
    total: deliveries.length,
    requested: deliveries.filter(d => d.status === 'requested').length,
    ordered: deliveries.filter(d => d.status === 'ordered').length,
    enRoute: deliveries.filter(d => d.status === 'en_route').length,
    received: deliveries.filter(d => d.status === 'received').length,
    completed: deliveries.filter(d => d.status === 'completed').length,
    returned: deliveries.filter(d => d.status === 'returned').length,
    cancelled: deliveries.filter(d => d.status === 'cancelled').length
  };

  return {
    deliveries, stats, materials, suppliers, staff, employees, loading: q.loading, error: q.error, refresh: q.refresh,
    createDelivery: async (data: { inventory_item_id: string; supplier_id?: string; requested_quantity: number; expected_arrival_date?: string; notes?: string; requested_by?: string }) => {
      const r = await safe(() => db.createDelivery(data).then(() => q.refresh()));
      return r;
    },
    updateDelivery: async (id: string, updates: Record<string, any>) => {
      const r = await safe(() => db.updateDelivery(id, updates).then(() => q.refresh()));
      return r;
    },
    confirmReceipt: async (id: string, receipt: { received_quantity: number; receipt_reference_number: string }) => {
      const r = await safe(() => db.confirmDeliveryReceipt(id, receipt).then(() => q.refresh()));
      return r;
    },
  };
}
