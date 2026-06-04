import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/config/supabaseClient';
import { crmDb as db } from '../services/crmDb';
import { orderDb } from '@/modules/operations/services/orderDb';
import type { CatalogProduct, CartItem } from '@/Types';
import { useQuery, safe } from '@/hooks/useSupabaseQuery';

export function useProductCatalog(filters?: { search?: string; category?: string }) {
  const { data: raw, loading, error, refresh } = useQuery(
    () => db.getCatalogProducts(filters),
    [filters?.search, filters?.category],
    ['products', 'product_supply_mapping', 'inventory_items'],
  );
  const products: CatalogProduct[] = (raw || []).map((p: any) => ({
    id: p.id,
    title: p.name,
    category: p.category || "",
    variant: p.variant || "",
    size: p.size_spec || "",
    price: Number(p.final_price),
    description: p.description || "",
    isActive: p.is_active ?? true,
    maxCapacity: Number(p.max_capacity ?? 0),
  }));
  return { products, loading, error, refresh };
}

export function useCartData() {
  const queryClient = useQueryClient();
  const { data: rawItems, loading, error, refresh } = useQuery(() => db.getCart(), ['cart'], ['cart_items', 'products']);
  const raw = rawItems || [];
  const items: CartItem[] = raw.map((r: any) => ({
    id: r.id, productId: r.product_id,
    productName: r.product?.name || 'Unknown', category: r.product?.category || '',
    variant: r.product?.variant || '', sizeSpec: r.product?.size_spec || '',
    price: Number(r.product?.final_price || 0), quantity: r.quantity,
    specifications: r.specifications, fileUrl: r.file_url,
  }));
  const totalItems = raw.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
  const totalPrice = raw.reduce((s: number, i: any) => s + (i.quantity || 0) * parseFloat(i.product?.final_price || '0'), 0);
  return {
    items, totalItems, totalPrice, loading, error, refresh,
    addToCart: async (productId: string, qty?: number, forceNewRow?: boolean, specs?: string, fileUrl?: string) => { const r = await safe(() => db.addToCart(productId, qty, forceNewRow, specs, fileUrl).then(() => refresh())); return r; },
    updateQuantity: async (id: string, qty: number) => { const r = await safe(() => db.updateCartItem(id, { quantity: Math.max(1, qty) }).then(() => refresh())); return r; },
    updateCartItem: async (id: string, updates: { quantity?: number; specifications?: string; fileUrl?: string }) => { const r = await safe(() => db.updateCartItem(id, updates).then(() => refresh())); return r; },
    removeItem: async (id: string) => { const r = await safe(() => db.removeCartItem(id).then(() => refresh())); return r; },
    clearCart: async () => { const r = await safe(() => db.clearCart().then(() => refresh())); return r; },
    checkout: async (notes?: string, due?: string, ids?: string[]) => {
      try {
        const o = await db.checkout(notes, due, ids);
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        await refresh();
        return { success: true, error: null, order: o };
      } catch (e: any) {
        return { success: false, error: e.message, order: null };
      }
    },
    directOrder: async (data: { productId: string; productName: string; quantity: number; unitPrice: number; specifications?: string; fileUrl?: string }) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        await orderDb.createOrder({ customer_id: user.id, order_type: 'online', special_instructions: data.specifications, items: [{ product_id: data.productId, product_name: data.productName, quantity: data.quantity, unit_price: data.unitPrice, specifications: data.specifications, file_url: data.fileUrl }] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        return { success: true, error: null };
      } catch (e: any) { return { success: false, error: e.message || 'Failed to place order' }; }
    },
  };
}
