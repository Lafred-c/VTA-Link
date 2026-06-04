import {supabase} from "@/config/supabaseClient";
import {adminDb} from "@/modules/admin/services/adminDb";

export async function getOrders(filters?: {
  status?: string;
  assigned_designer?: string;
  assigned_production?: string;
}) {
  let query = supabase
    .from("orders")
    .select(
      `
      *,
      customer:customer_id(id, first_name, last_name, email, contact_number, is_suki),
      designer:assigned_designer(id, first_name, last_name),
      production_staff:assigned_production(id, full_name),
      order_items(id, product_id, product_name, quantity, unit_price, subtotal, specifications, file_url),
      payments(id, amount, payment_method, reference_number, created_at, status, decline_reason)
    `,
    )
    .order("created_at", {ascending: false});

  if (filters?.status && filters.status !== "all")
    query = query.eq("status", filters.status);
  if (filters?.assigned_designer)
    query = query.eq("assigned_designer", filters.assigned_designer);
  if (filters?.assigned_production)
    query = query.eq("assigned_production", filters.assigned_production);

  const {data, error} = await query;
  if (error) throw error;
  return data || [];
}

export async function getOrderById(id: string) {
  const {data, error} = await supabase
    .from("orders")
    .select(
      `
      *,
      customer:customer_id(id, first_name, last_name, email, contact_number, is_suki),
      designer:assigned_designer(id, first_name, last_name),
      production_staff:assigned_production(id, full_name),
      order_items(id, product_id, product_name, quantity, unit_price, subtotal, specifications, file_url),
      payments(id, amount, payment_method, reference_number, created_at, status, decline_reason)
    `,
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createOrder(order: {
  customer_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  order_type: string;
  special_instructions?: string;
  due_date?: string;
  assigned_designer?: string;
  assigned_production?: string;
  comments?: string;
  design_file_url?: string;
  items: {
    product_id?: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    specifications?: string;
    file_url?: string;
  }[];
}) {
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let orderNumber: string;
  try {
    const {data: seq} = await supabase.rpc("get_next_order_seq");
    orderNumber = `ORD-${new Date().getFullYear()}-${String(seq ?? Date.now()).padStart(5, "0")}`;
  } catch {
    orderNumber = `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  }

  const totalAmount = order.items.reduce(
    (s, i) => s + i.quantity * i.unit_price,
    0,
  );

  const {data: newOrder, error: orderErr} = await supabase
    .from("orders")
    .insert([
      {
        order_number: orderNumber,
        customer_id: order.customer_id || null,
        guest_name: order.guest_name || null,
        guest_phone: order.guest_phone || null,
        guest_email: order.guest_email || null,
        created_by: user.id,
        order_type: order.order_type || "walk-in",
        status: "in_queue",
        payment_status: "unpaid",
        special_instructions: order.special_instructions || null,
        comments: order.comments || null,
        due_date: order.due_date || null,
        total_amount: totalAmount,
        amount_paid: 0,
        assigned_designer: order.assigned_designer || null,
        assigned_production: order.assigned_production || null,
        design_file_url: order.design_file_url || null,
      },
    ])
    .select()
    .single();

  if (orderErr) throw orderErr;

  const items = order.items.map((i) => ({
    order_id: newOrder.id,
    product_id: i.product_id || null,
    product_name: i.product_name,
    quantity: i.quantity,
    unit_price: i.unit_price,
    subtotal: i.quantity * i.unit_price,
    specifications: i.specifications || null,
    file_url: i.file_url || null,
  }));

  await supabase.from("order_items").insert(items);

  await adminDb.logAudit("Create Order", "orders", newOrder.id, {
    order_number: orderNumber,
    total_amount: totalAmount,
    items_count: items.length,
  });

  await adminDb.notifyRoles(
    ["admin", "cashier"],
    "New Order Received",
    `Order ${orderNumber} has been placed for ${order.guest_name || "a customer"}.`,
    "orders",
    newOrder.id,
  );

  if (order.assigned_designer) {
    await adminDb.notifyUser(
      order.assigned_designer,
      "New Design Assignment",
      `You have been assigned to design Order ${orderNumber}.`,
      "orders",
      newOrder.id,
    );
  }

  return newOrder;
}

export async function updateOrder(id: string, updates: Record<string, any>) {
  const {data: old} = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();
  let finalUpdates = {...updates};
  if (finalUpdates.status === "payment" && old && old.customer_id) {
    const {data: customer} = await supabase
      .from("users")
      .select("is_suki")
      .eq("id", old.customer_id)
      .single();
    if (customer && customer.is_suki) {
      finalUpdates.status = "production";
    }
  }

  const {data, error} = await supabase
    .from("orders")
    .update(finalUpdates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await adminDb.logAudit("Update Order", "orders", id, {
    before: old,
    after: data,
    changed: Object.keys(updates),
  });

  if (updates.status && updates.status !== old.status) {
    await adminDb.notifyRoles(
      ["admin", "cashier"],
      "Order Status Updated",
      `Order ${data.order_number} changed from ${old.status} to ${data.status}.`,
      "orders",
      id,
    );
    if (data.customer_id) {
      await adminDb.notifyUser(
        data.customer_id,
        "Order Update",
        `Your order ${data.order_number} is now ${data.status.replace("_", " ")}.`,
        "orders",
        id,
      );
    }
  }

  return data;
}

export async function deleteOrder(id: string) {
  await supabase.from("payments").delete().eq("order_id", id);
  await supabase.from("order_items").delete().eq("order_id", id);
  const {error} = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

export async function requestCancellation(orderId: string, reason: string) {
  // Mark order as cancel_requested with the reason
  const {data: order, error: fetchErr} = await supabase
    .from("orders")
    .select("order_number, assigned_designer, customer_id")
    .eq("id", orderId)
    .single();
  if (fetchErr) throw fetchErr;

  const {error} = await supabase
    .from("orders")
    .update({status: "cancel_requested", cancel_reason: reason})
    .eq("id", orderId);
  if (error) throw error;

  // Notify the assigned designer
  if (order.assigned_designer) {
    await adminDb.notifyUser(
      order.assigned_designer,
      `Cancellation Request – ${order.order_number}`,
      `Customer requested cancellation: "${reason}"`,
      "orders",
      orderId,
    );
  }
  await adminDb.logAudit("Request Cancellation", "orders", orderId, {reason});
}

export async function handleCancellationRequest(
  orderId: string,
  approve: boolean,
  designerNote?: string,
) {
  const {data: order, error: fetchErr} = await supabase
    .from("orders")
    .select("order_number, customer_id")
    .eq("id", orderId)
    .single();
  if (fetchErr) throw fetchErr;

  if (approve) {
    // Cancel the order
    const {error} = await supabase
      .from("orders")
      .update({status: "cancelled", cancel_reason: null})
      .eq("id", orderId);
    if (error) throw error;

    // Notify the customer
    if (order.customer_id) {
      await adminDb.notifyUser(
        order.customer_id,
        `Order Cancelled – ${order.order_number}`,
        "Your cancellation request has been approved. Your order has been cancelled.",
        "orders",
        orderId,
      );
    }
    await adminDb.logAudit("Approve Cancellation", "orders", orderId, {});
  } else {
    // Revert to Designing
    const {error} = await supabase
      .from("orders")
      .update({status: "designing", cancel_reason: null})
      .eq("id", orderId);
    if (error) throw error;

    // Notify the customer with the rejection
    if (order.customer_id) {
      await adminDb.notifyUser(
        order.customer_id,
        `Cancellation Denied – ${order.order_number}`,
        designerNote
          ? `Your cancellation request was declined: "${designerNote}"`
          : "Your cancellation request was declined. Your order continues in design.",
        "orders",
        orderId,
      );
    }
    await adminDb.logAudit("Reject Cancellation", "orders", orderId, {
      note: designerNote,
    });
  }
}

export const orderDb = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  requestCancellation,
  handleCancellationRequest,
};
