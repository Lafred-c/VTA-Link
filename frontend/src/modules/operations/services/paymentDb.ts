import { supabase } from '@/config/supabaseClient';
import { adminDb } from '@/modules/admin/services/adminDb';
import { chat } from '@/modules/crm/services/crmDb';

export async function recordPayment(
    orderId: string,
    payment: {
      amount: number;
      payment_method: string;
      reference_number?: string;
      notes?: string;
    },
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error: payErr } = await supabase.from("payments").insert([
      {
        order_id: orderId,
        amount: payment.amount,
        payment_method: payment.payment_method,
        reference_number: payment.reference_number,
        status: "pending",
      },
    ]);
    if (payErr) throw payErr;

    const { data: order } = await supabase.from('orders').select('order_number').eq('id', orderId).single();
    await adminDb.logAudit("Record Payment", "payments", orderId, {
      amount: payment.amount,

      method: payment.payment_method,
      ref: payment.reference_number
    });
    await adminDb.notifyRoles(['admin', 'cashier'], "New Payment Recorded", `A payment of ₱${payment.amount.toLocaleString()} has been recorded for Order ${order?.order_number || 'N/A'}.`, 'orders', orderId);
  }

export async function approvePayment(paymentId: string, orderId: string) {
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "approved" })
      .eq("id", paymentId);

    if (updateError) throw updateError;

    await adminDb.logAudit("Approve Payment", "payments", paymentId, { order_id: orderId });
    return syncOrderPaymentStatus(orderId);
  }

export async function declinePayment(paymentId: string, orderId: string, reason: string) {
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "declined",
        decline_reason: reason,
      })
      .eq("id", paymentId);

    if (updateError) throw updateError;

    const { data: order } = await supabase
      .from("orders")
      .select("customer_id, order_number")
      .eq("id", orderId)
      .single();

    if (order && order.customer_id) {
      try {
        await chat.sendMessage(
          order.customer_id,
          `Your payment for order ${order.order_number} was declined. Reason: ${reason}. Please try paying again.`,
          orderId,
        );
      } catch (err) {
        console.warn("Failed to notify customer of declined payment", err);
      }
      await adminDb.notifyUser(order.customer_id, "Payment Declined", `Your payment for Order ${order.order_number} was declined. Reason: ${reason}`, 'orders', orderId);
    }

    await adminDb.logAudit("Decline Payment", "payments", paymentId, { order_id: orderId, reason });

    await supabase
      .from("orders")
      .update({
        last_decline_reason: reason,
        has_unread_decline: true,
      })
      .eq("id", orderId);

    return syncOrderPaymentStatus(orderId);
  }

export async function syncOrderPaymentStatus(orderId: string) {
    const { data: approvedPayments, error: sumError } = await supabase
      .from("payments")
      .select("amount")
      .eq("order_id", orderId)
      .eq("status", "approved");

    if (sumError) throw sumError;

    const totalApproved = (approvedPayments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    const { data: order, error: orderFetchError } = await supabase
      .from("orders")
      .select("total_amount")
      .eq("id", orderId)
      .single();

    if (orderFetchError) throw orderFetchError;

    const totalAmount = parseFloat(order.total_amount);
    let newStatus: "paid" | "partial" | "unpaid" = "unpaid";
    if (totalApproved >= totalAmount) newStatus = "paid";
    else if (totalApproved > 0) newStatus = "partial";

    const { error: finalError } = await supabase
      .from("orders")
      .update({
        amount_paid: totalApproved,
        payment_status: newStatus,
      })
      .eq("id", orderId);

    if (finalError) throw finalError;

    return { success: true };
  }

export async function markDeclineAsRead(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ has_unread_decline: false })
      .eq("id", orderId);
    if (error) throw error;
  }

export async function getPayments(orderId: string) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

export async function uploadOrderFile(
    file: File,
    oldUrl?: string,
): Promise<string> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Validate file size (2MB limit as per UI)
    if (file.size > 2 * 1024 * 1024)
        throw new Error("File size exceeds 2MB limit");

    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;
    const filePath = `customer-uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from("order-files")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
        });

    if (uploadError) {
        console.error("Error uploading file:", uploadError);
        throw uploadError;
    }

    // Delete old file if it exists and belongs to the 'order-files' bucket
    if (oldUrl && oldUrl.includes("order-files/")) {
        try {
            const oldPath = oldUrl.split("order-files/").pop();
            if (oldPath) {
                await supabase.storage.from("order-files").remove([oldPath]);
                console.log(
                    "Successfully removed old order file from storage:",
                    oldPath,
                );
            }
        } catch (deleteError) {
            console.warn("Failed to delete old order file:", deleteError);
        }
    }

    const {
        data: { publicUrl },
    } = supabase.storage.from("order-files").getPublicUrl(filePath);

    return publicUrl;
}

export const paymentDb = {
  recordPayment,
  approvePayment,
  declinePayment,
  syncOrderPaymentStatus,
  markDeclineAsRead,
  getPayments,
  uploadOrderFile
};
