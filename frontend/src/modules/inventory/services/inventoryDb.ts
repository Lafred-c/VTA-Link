// Generated database service file
import { supabase } from '@/config/supabaseClient';
import { sanitizeInput } from '@/util/security';
import { adminDb } from '@/modules/admin/services/adminDb';

export async function getInventoryItems() {
    const { data, error } = await supabase
      .from("inventory_items")
      .select(
        "*, item_suppliers(id, supplier_unit_price, lead_time_days, is_preferred, suppliers(id, name))",
      )
      .order("name");
    if (error) throw error;
    return data || [];
  }

export async function createInventoryItem(item: {
    name: string;
    unit_of_measure: string;
    current_quantity?: number;
    reorder_point?: number;
    unit_cost?: number;
    description?: string;
    purchase_unit?: string;
    conversion_rate?: number;
  }, supplierIds?: string[]) {
    const { data, error } = await supabase
      .from("inventory_items")
      .insert([{ ...item, is_active: true }])
      .select()
      .single();
    if (error) throw error;
    await adminDb.logAudit("Create Inventory Item", "inventory_items", data.id, { name: data.name });

    if (supplierIds && supplierIds.length > 0) {
      await updateMaterialSuppliers(data.id, supplierIds);
    }

    return data;
  }

export async function updateInventoryItem(id: string, updates: Record<string, any>) {
    const { data: oldItem } = await supabase.from('inventory_items').select('*').eq('id', id).single();
    const { data, error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    await adminDb.logAudit("Update Inventory", "inventory_items", id, {
      before: oldItem,
      after: data,
      changed_fields: Object.keys(updates)
    });

    if (data.current_quantity <= data.reorder_point && (!oldItem || oldItem.current_quantity > oldItem.reorder_point)) {
      await adminDb.notifyRoles(['admin', 'cashier'], "Low Stock Alert", `${data.name} is below reorder point (${data.current_quantity} left).`, 'inventory', id);
    }

    return data;
  }

export async function updateMaterialSuppliers(materialId: string, supplierIds: string[]) {
    // Delete existing
    await supabase.from("product_supply_mapping").delete().eq("inventory_item_id", materialId);

    // Insert new
    if (supplierIds.length > 0) {
      const inserts = supplierIds.map(sid => ({
        inventory_item_id: materialId,
        supplier_id: sid
      }));
      const { error } = await supabase.from("product_supply_mapping").insert(inserts);
      if (error) throw error;
    }
  }

export async function getSuppliers() {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");
    if (error) throw error;
    return data || [];
  }

export async function createSupplier(s: {
    name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    address?: string;
  }) {
    const { data, error } = await supabase
      .from("suppliers")
      .insert([{ ...s, is_active: true, is_flagged: false }])
      .select()
      .single();
    if (error) throw error;
    await adminDb.logAudit("Create Supplier", "suppliers", data.id, { name: data.name });
    return data;
  }

export async function updateSupplier(id: string, updates: Record<string, any>) {
    const { data, error } = await supabase
      .from("suppliers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await adminDb.logAudit("Update Supplier", "suppliers", id, { updates });
    return data;
  }

export async function getSupplierMaterials(supplierId: string) {
    const { data, error } = await supabase
      .from("item_suppliers")
      .select("inventory_item_id")
      .eq("supplier_id", supplierId);
    if (error) throw error;
    return data || [];
  }

export async function updateSupplierMaterials(supplierId: string, materialIds: string[]) {
    // 1. Delete all existing mappings for this supplier
    const { error: delError } = await supabase
      .from("item_suppliers")
      .delete()
      .eq("supplier_id", supplierId);
    if (delError) throw delError;

    if (materialIds.length === 0) return { success: true };

    // 2. Insert new mappings
    const inserts = materialIds.map(id => ({
      supplier_id: supplierId,
      inventory_item_id: id,
      is_preferred: false,
      supplier_unit_price: 0,
      lead_time_days: 0,
    }));

    const { error: insError } = await supabase
      .from("item_suppliers")
      .insert(inserts);
    if (insError) throw insError;

    return { success: true };
  }

export async function getProducts(filters?: { category?: string; search?: string }) {
    let query = supabase
      .from("products")
      .select("*")
      .order("category")
      .order("name");
    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.search) {
      const cleanSearch = sanitizeInput(filters.search);
      if (cleanSearch) {
        query = query.or(
          `name.ilike.%${cleanSearch}%,category.ilike.%${cleanSearch}%`,
        );
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

export async function createProduct(p: Record<string, any>) {
    const { data, error } = await supabase
      .from("products")
      .insert([{ ...p, is_active: true }])
      .select()
      .single();
    if (error) throw error;
    await adminDb.logAudit("Create Product", "products", data.id, { name: data.name, category: data.category });
    return data;
  }

export async function updateProduct(id: string, updates: Record<string, any>) {
    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await adminDb.logAudit("Update Product", "products", id, { updates });
    return data;
  }

export async function deleteInventoryItem(id: string) {
    const { error } = await supabase
      .from("inventory_items")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
  }

export async function getProductsWithBOM(filters?: { search?: string; category?: string }) {
    let query = supabase
      .from("products")
      .select(
        "*, product_supply_mapping(id, inventory_item_id, quantity_required, inventory_items:inventory_item_id(id, name, unit_of_measure, unit_cost))"
      );

    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,category.ilike.%${filters.search}%`);
    }

    const { data, error } = await query
      .order("category")
      .order("name");
    if (error) throw error;
    return data || [];
  }

export async function createProductWithBOM(
    product: {
      name: string;
      category?: string;
      variant?: string;
      size_spec?: string;
      material_cost: number;
      profit_fee: number;
      final_price: number;
      description?: string;
    },
    bom: { inventory_item_id: string; quantity_required: number }[],
  ) {
    const { data: p, error: pErr } = await supabase
      .from("products")
      .insert([{ ...product, is_active: true }])
      .select()
      .single();
    if (pErr) throw pErr;

    if (bom.length > 0) {
      const rows = bom.map((b) => ({ product_id: p.id, ...b }));
      const { error: bErr } = await supabase
        .from("product_supply_mapping")
        .insert(rows);
      if (bErr) throw bErr;
    }
    return p;
  }

export async function updateProductWithBOM(
    id: string,
    product: Record<string, any>,
    bom?: { inventory_item_id: string; quantity_required: number }[],
  ) {
    product.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("products")
      .update(product)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    if (bom !== undefined) {
      await supabase
        .from("product_supply_mapping")
        .delete()
        .eq("product_id", id);
      if (bom.length > 0) {
        const rows = bom.map((b) => ({ product_id: id, ...b }));
        await supabase.from("product_supply_mapping").insert(rows);
      }
    }
    return data;
  }

export async function deleteProduct(id: string) {
    const { error } = await supabase
      .from("products")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

export async function getDeliveries(filters?: { status?: string }) {
    let query = supabase
      .from("deliveries")
      .select(
        `
      *,
      inventory_item:inventory_item_id(id, name, unit_of_measure, purchase_unit, conversion_rate),
      supplier:supplier_id(id, name),
      requester:requested_by(id, first_name, last_name)
    `,
      )
      .order("created_at", { ascending: false });
    if (filters?.status && filters.status !== "all")
      query = query.eq("status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

export async function createDelivery(d: {
    inventory_item_id: string;
    supplier_id?: string;
    requested_quantity: number;
    expected_arrival_date?: string;
    notes?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("deliveries")
      .insert([
        {
          ...d,
          requested_by: user.id,
          status: "requested",
        },
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

export async function updateDelivery(id: string, updates: Record<string, any>) {
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("deliveries")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

export async function confirmDeliveryReceipt(
    id: string,
    receipt: {
      received_quantity: number;
      receipt_reference_number: string;
    },
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: delivery, error: dErr } = await supabase
      .from("deliveries")
      .update({
        status: "received",
        received_quantity: receipt.received_quantity,
        receipt_reference_number: receipt.receipt_reference_number,
        received_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        "*, inventory_item:inventory_item_id(id, conversion_rate, current_quantity)",
      )
      .single();
    if (dErr) throw dErr;

    const item = delivery.inventory_item;
    const conversionRate = Number(item.conversion_rate) || 1;
    const addQty = receipt.received_quantity * conversionRate;
    const newQty = Number(item.current_quantity) + addQty;

    const { error: iErr } = await supabase
      .from("inventory_items")
      .update({ current_quantity: newQty, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (iErr) throw iErr;

    await supabase.from("inventory_changes").insert([
      {
        inventory_item_id: item.id,
        change_type: "Manual Adjustment",
        quantity_change: addQty,
        quantity_before: Number(item.current_quantity),
        quantity_after: newQty,
        reason: `Delivery receipt #${receipt.receipt_reference_number}`,
        changed_by: user.id,
      },
    ]);

    return delivery;
  }

export const inventoryDb = {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  updateMaterialSuppliers,
  getSuppliers,
  createSupplier,
  updateSupplier,
  getSupplierMaterials,
  updateSupplierMaterials,
  getProducts,
  createProduct,
  updateProduct,
  deleteInventoryItem,
  getProductsWithBOM,
  createProductWithBOM,
  updateProductWithBOM,
  deleteProduct,
  getDeliveries,
  createDelivery,
  updateDelivery,
  confirmDeliveryReceipt
};
