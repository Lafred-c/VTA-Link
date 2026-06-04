import { supabase } from '@/config/supabaseClient';
import { adminDb } from '@/modules/admin/services/adminDb';

export async function getOrderBOM(orderId: string) {
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);
    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) return [];

    const productIds = items.map((i: any) => i.product_id).filter(Boolean);
    if (productIds.length === 0) return [];

    const { data: bom, error: bomErr } = await supabase
      .from("product_supply_mapping")
      .select("product_id, inventory_item_id, quantity_required, inventory_items(id, name, unit_of_measure, current_quantity)")
      .in("product_id", productIds);
    if (bomErr) throw bomErr;

    // Build result: one entry per BOM line, with total_standard_usage = qty_required × order_qty
    const result: {
      inventory_item_id: string;
      material_name: string;
      quantity_required: number;
      unit: string;
      total_standard_usage: number;
      current_quantity: number;
    }[] = [];

    for (const orderItem of items) {
      if (!orderItem.product_id) continue;
      const bomLines = (bom || []).filter((b: any) => b.product_id === orderItem.product_id);
      for (const b of bomLines) {
        const inv = (b as any).inventory_items;
        result.push({
          inventory_item_id: b.inventory_item_id,
          material_name: inv?.name || "—",
          quantity_required: Number(b.quantity_required),
          unit: inv?.unit_of_measure || "",
          total_standard_usage: Number(b.quantity_required) * Number(orderItem.quantity),
          current_quantity: Number(inv?.current_quantity) || 0,
        });
      }
    }

    return result;
  }

export async function deductInventoryForOrder(orderId: string, excessUsage?: Record<string, number>) {
    // 1. Get order items (product_id + quantity ordered)
    const { data: items, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);
    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) return;

    const productIds = items.map((i: any) => i.product_id).filter(Boolean);
    if (productIds.length === 0) return; // walk-in orders with no linked products

    // 2. Get BOM for those products
    const { data: bom, error: bomErr } = await supabase
      .from("product_supply_mapping")
      .select("product_id, inventory_item_id, quantity_required")
      .in("product_id", productIds);
    if (bomErr) throw bomErr;
    if (!bom || bom.length === 0) return;

    // 3. Calculate total deduction per inventory item
    const deductions: Record<string, number> = {};
    for (const orderItem of items) {
      if (!orderItem.product_id) continue;
      const bomRows = bom.filter((b: any) => b.product_id === orderItem.product_id);
      for (const row of bomRows) {
        const standard = Number(row.quantity_required) * Number(orderItem.quantity);
        const excess = excessUsage?.[row.inventory_item_id] || 0;
        deductions[row.inventory_item_id] = (deductions[row.inventory_item_id] || 0) + standard + excess;
      }
    }

    // 4. Apply deductions to each inventory item
    for (const [inventoryItemId, totalDeduction] of Object.entries(deductions)) {
      if (totalDeduction <= 0) continue;
      const { data: inv, error: invErr } = await supabase
        .from("inventory_items")
        .select("current_quantity")
        .eq("id", inventoryItemId)
        .single();
      if (invErr || !inv) { console.warn(`Could not fetch inventory item ${inventoryItemId}`); continue; }
      const newQty = Math.max(0, Number(inv.current_quantity) - totalDeduction);
      const { error: updateErr } = await supabase
        .from("inventory_items")
        .update({ current_quantity: newQty })
        .eq("id", inventoryItemId);
      if (updateErr) console.warn(`Failed to deduct inventory item ${inventoryItemId}:`, updateErr);
    }

    await adminDb.logAudit("Inventory Deduction", "orders", orderId, { deductions, excessUsage });
  }

export const productionDb = {
  getOrderBOM,
  deductInventoryForOrder
};
