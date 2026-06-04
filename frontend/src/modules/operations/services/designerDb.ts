import { supabase } from '@/config/supabaseClient';
import { adminDb } from '@/modules/admin/services/adminDb';
import { chat } from '@/modules/crm/services/crmDb';

export async function updateDesignerOrderDetails(
    orderId: string,
    updates: { total_amount?: number; due_date?: string },
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: actor, error: actorErr } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (actorErr) throw actorErr;
    if ((actor?.role || "").toLowerCase() !== "designer") {
      throw new Error("Only designers can edit order pricing in this flow");
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, assigned_designer, status, total_amount")
      .eq("id", orderId)
      .single();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");
    if (order.assigned_designer !== user.id) {
      throw new Error("You can only edit orders assigned to you");
    }
    if (order.status !== "designing") {
      throw new Error("Order can only be edited during Designing phase");
    }

    const payload: Record<string, any> = {};
    if (updates.total_amount !== undefined) {
      const current = Number(order.total_amount) || 0;
      const incoming = Number(updates.total_amount);
      if (!Number.isFinite(incoming) || incoming <= 0) {
        throw new Error("Total amount must be a valid positive number");
      }
      if (incoming < current) {
        throw new Error("Designers can only increase the total amount");
      }
      payload.total_amount = incoming;
    }
    if (updates.due_date !== undefined) payload.due_date = updates.due_date;
    if (Object.keys(payload).length === 0) return order;

    const { data, error } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

export async function assignDesignerForAcceptance(orderId: string, designerId: string) {
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();
    if (fetchError) throw fetchError;
    if (!order) throw new Error("Order not found");

    if (order.status !== "in_queue") {
      throw new Error(
        "Only in-queue orders can be assigned for design acceptance",
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        assigned_designer: designerId,
        status: "in_queue",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) throw error;

    await adminDb.logAudit("Assign Designer", "orders", orderId, { designer_id: designerId });
    await adminDb.notifyUser(designerId, "New Assignment", `You have been assigned to Order ${data.order_number}. Please accept to start designing.`, 'orders', orderId);

    return data;
  }

export async function designerAcceptAssignedOrder(orderId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_number, customer_id, assigned_designer, status")
      .eq("id", orderId)
      .single();
    if (fetchError) throw fetchError;
    if (!order) throw new Error("Order not found");

    if (order.assigned_designer !== user.id) {
      throw new Error("Only the assigned designer can accept this order");
    }
    if (order.status !== "in_queue") {
      throw new Error("Only in-queue orders can be accepted for designing");
    }

    const { data: updated, error: updateErr } = await supabase
      .from("orders")
      .update({ status: "designing" })
      .eq("id", orderId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    if (order.customer_id) {
      try {
        const { data: profile } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        const designerName = profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
          : "Your designer";

        await chat.sendMessage(
          order.customer_id,
          `Hi! Your order **${order.order_number}** has been accepted by ${designerName} and is now in the Designing phase.`,
          orderId,
        );
      } catch (msgErr) {
        console.warn("Designer acceptance notification failed:", msgErr);
      }
    }

    await adminDb.logAudit("Designer Accept Order", "orders", orderId, { order_number: order.order_number });
    await adminDb.notifyRoles(['admin', 'cashier'], "Designer Accepted Order", `Order ${order.order_number} has been accepted by ${user.id}.`, 'orders', orderId);

    return updated;
  }

export async function designerSelfPickOrder(orderId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_number, customer_id, assigned_designer, status")
      .eq("id", orderId)
      .single();
    if (fetchError) throw fetchError;
    if (!order) throw new Error("Order not found");

    if (order.status !== "in_queue") {
      throw new Error("Only in-queue orders can be self-picked");
    }
    if (order.assigned_designer) {
      throw new Error("Order is already assigned to another designer");
    }

    const { data: updated, error: updateErr } = await supabase
      .from("orders")
      .update({ assigned_designer: user.id, status: "designing" })
      .eq("id", orderId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    if (order.customer_id) {
      try {
        const { data: profile } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        const designerName = profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
          : "Your designer";

        await chat.sendMessage(
          order.customer_id,
          `Hi! Your order **${order.order_number}** has been picked up by ${designerName} and is now in the Designing phase.`,
          orderId,
        );
      } catch (msgErr) {
        console.warn("Self-pick notification failed:", msgErr);
      }
    }

    return updated;
  }

export async function designerRejectAssignedOrder(orderId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_number, assigned_designer, status, rejected_by_designers")
      .eq("id", orderId)
      .single();
    if (fetchError) throw fetchError;
    if (!order) throw new Error("Order not found");

    if (order.assigned_designer && order.assigned_designer !== user.id) {
      throw new Error("Only the assigned designer can reject this order");
    }

    const { data: updated, error: updateErr } = await supabase
      .from("orders")
      .update({
        assigned_designer: null,
        status: "in_queue",
        rejected_by_designers: [...(order.rejected_by_designers || []), user.id]
      })
      .eq("id", orderId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await adminDb.logAudit("Designer Reject Order", "orders", orderId, { order_number: order.order_number });
    await adminDb.notifyRoles(['admin', 'cashier'], "Designer Rejected Order", `Order ${order.order_number} was rejected by ${user.id} and returned to queue.`, 'orders', orderId);

    return updated;
  }

export async function updateCustomerDesign(orderId: string, url: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: actor, error: actorErr } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (actorErr) throw actorErr;

    if ((actor?.role || "").toLowerCase() === "designer") {
      throw new Error(
        "Designer cannot upload or replace customer initial design",
      );
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");

    if (!["in_queue", "designing"].includes(order.status)) {
      throw new Error(
        "Initial design can only be replaced during In-Queue or Designing phase",
      );
    }

    await supabase
      .from("orders")
      .update({ design_file_url: url })
      .eq("id", orderId);

    const { data: items, error: fetchError } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1);

    if (fetchError) throw fetchError;
    if (!items || items.length === 0)
      throw new Error("No items found for this order");

    const { data, error } = await supabase
      .from("order_items")
      .update({ file_url: url })
      .eq("id", items[0].id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

export async function submitFinalDesign(orderId: string, url: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, customer_id, assigned_designer, status")
      .eq("id", orderId)
      .single();
    if (fetchError) throw fetchError;
    if (!order) throw new Error("Order not found");

    if (order.assigned_designer !== user.id) {
      throw new Error("Only the assigned designer can submit final design");
    }
    if (order.status !== "designing") {
      throw new Error(
        "Final design can only be submitted during Designing phase",
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ final_design_url: url })
      .eq("id", orderId)
      .select()
      .single();
    if (error) throw error;

    if (order.customer_id) {
      try {
        await chat.sendMessage(
          order.customer_id,
          "Your final design preview is ready. Please review and accept it to move your order to Payment.",
          orderId,
          url,
        );
      } catch (msgErr) {
        console.warn("Final design notification failed:", msgErr);
      }
    }

    return data;
  }

export async function approveOrderDesign(orderId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: actor } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const isDesigner = (actor?.role || "").toLowerCase() === "designer";
    const isAdmin = (actor?.role || "").toLowerCase() === "admin";

    if (!isDesigner && !isAdmin) {
      throw new Error("Only designers or admins can approve the final design");
    }

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select(`
        id, 
        customer_id, 
        assigned_designer, 
        status, 
        final_design_url,
        customer:customer_id(is_suki)
      `)
      .eq("id", orderId)
      .single();
    if (fetchError) throw fetchError;
    if (!order) throw new Error("Order not found");

    if (isDesigner && order.assigned_designer !== user.id) {
      throw new Error("You can only approve designs for orders assigned to you");
    }
    if (order.status !== "designing") {
      throw new Error("Order is not currently in Designing phase");
    }
    if (!order.final_design_url) {
      throw new Error("No final design found to approve");
    }

    const isSuki = !!(order?.customer as any)?.is_suki;
    const nextStatus = isSuki ? "production" : "payment";

    const { data, error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId)
      .eq("status", "designing")
      .select()
      .single();
    if (error) throw error;

    if (order.customer_id) {
      try {
        await chat.sendMessage(
          order.customer_id,
          isSuki
            ? "Your final design has been approved by our team. Since you are a SUKI customer, your order has bypassed payment confirmation and is now in the Production phase."
            : "Your final design has been approved by our team. Your order is now in the Payment phase.",
          orderId,
        );
      } catch (msgErr) {
        console.warn("Customer notification failed:", msgErr);
      }
    }

    return data;
  }

export const designerDb = {
  updateDesignerOrderDetails,
  assignDesignerForAcceptance,
  designerAcceptAssignedOrder,
  designerSelfPickOrder,
  designerRejectAssignedOrder,
  updateCustomerDesign,
  submitFinalDesign,
  approveOrderDesign
};
