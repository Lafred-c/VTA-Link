import { supabase } from '@/config/supabaseClient';
import { isValidUUID } from '@/util/security';
import { orderDb } from '@/modules/operations/services/orderDb';

// ── Namespace: chat ──
export function formatChatTimestamp(dateStr: string) {
      if (!dateStr) return "";
      const date = new Date(dateStr);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }



async function chat_getConversations() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("chat_messages")
        .select(
          `
          id, sender_id, receiver_id, message, sent_at,
          sender:sender_id(id, first_name, last_name, role),
          receiver:receiver_id(id, first_name, last_name, role)
        `,
        )
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      if (!data) return [];

      const conversationsMap = new Map<string, any>();

      for (const msg of data as any[]) {
        const isSender = msg.sender_id === user.id;
        const otherProfile = isSender ? msg.receiver : msg.sender;
        const otherId = isSender ? msg.receiver_id : msg.sender_id;

        if (!otherId) continue;
        if (conversationsMap.has(otherId)) continue;

        conversationsMap.set(otherId, {
          id: otherId,
          userId: otherId,
          displayName: otherProfile
            ? `${otherProfile.first_name || ""} ${otherProfile.last_name || ""}`.trim()
            : "Unknown User",
          userRole: otherProfile?.role || "user",
          lastMessage: msg.message,
          lastMessageTime: formatChatTimestamp(msg.sent_at),
          unreadCount: 0,
          isActive: true,
          messages: [],
        });
      }

      return Array.from(conversationsMap.values());
}

async function chat_getUnreadCount(): Promise<number> {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;

      const lastViewed = localStorage.getItem(`chat_last_viewed_${user.id}`) || "1970-01-01T00:00:00Z";

      const { count, error } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .gt("sent_at", lastViewed);

      if (error) {
        console.warn("Failed to fetch unread count:", error.message);
        return 0;
      }
      return count ?? 0;
    }

export function markMessagesViewed(): void {
      const userId = localStorage.getItem("chat_user_id");
      if (userId) {
        localStorage.setItem(`chat_last_viewed_${userId}`, new Date().toISOString());
      }
    }

async function chat_initUserId(): Promise<void> {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        localStorage.setItem("chat_user_id", user.id);
      }
    }

async function chat_getMessages(otherUserId: string) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      if (!isValidUUID(otherUserId)) {
        console.error("Invalid otherUserId:", otherUserId);
        return [];
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .select(
          `id, sender_id, message, attachment_url, sent_at, sender:sender_id(first_name, last_name, role)`,
        )
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`,
        )
        .order("sent_at", { ascending: true });

      if (error) throw error;
      if (!data) return [];

      const STAFF_ROLES = ["admin", "cashier", "designer", "production"];

      return data.map((msg: any) => ({
        id: msg.id,
        senderId: msg.sender_id,
        senderName: msg.sender
          ? `${msg.sender.first_name || ""} ${msg.sender.last_name || ""}`.trim()
          : "Unknown",
        content: msg.message,
        attachmentUrl: msg.attachment_url || undefined,
        timestamp: formatChatTimestamp(msg.sent_at),
        isFromAdmin: STAFF_ROLES.includes(
          (msg.sender?.role || "").toLowerCase(),
        ),
      }));
    }

async function chat_sendMessage(
      receiverId: string,
      message: string,
      orderId?: string,
      attachmentUrl?: string,
    ) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!isValidUUID(receiverId)) throw new Error("Invalid receiverId");
      if (orderId && !isValidUUID(orderId)) throw new Error("Invalid orderId");

      const { data, error } = await supabase
        .from("chat_messages")
        .insert([
          {
            sender_id: user.id,
            receiver_id: receiverId,
            message: message.trim(),
            order_id: orderId || null,
            attachment_url: attachmentUrl || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    }

async function chat_uploadChatImage(file: File, oldUrl?: string): Promise<string> {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Image must be under 2 MB");

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      if (oldUrl && oldUrl.includes("chat-attachments/")) {
        try {
          const oldPath = oldUrl.split("chat-attachments/").pop();
          if (oldPath) {
            await supabase.storage.from("chat-attachments").remove([oldPath]);
          }
        } catch (deleteError) {
          console.warn("Failed to delete old chat attachment:", deleteError);
        }
      }

      const { data: urlData } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(path);
      return urlData.publicUrl;
    }

export function subscribeToMessages(callback: (payload: any) => void) {
      return supabase
        .channel("chat_messages_realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          callback,
        )
        .subscribe();
    }

async function chat_getPotentialRecipients(currentUserRole: string) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const STAFF_ROLES = ["admin", "cashier", "designer", "production"];
      const isStaff = STAFF_ROLES.includes(
        (currentUserRole || "").toLowerCase(),
      );

      let query = supabase
        .from("users")
        .select("id, first_name, last_name, role")
        .eq("is_active", true)
        .neq("id", user.id);

      if (!isStaff) {
        query = query.in("role", [
          "admin",
          "cashier",
          "designer",
          "production",
          "Admin",
          "Cashier",
          "Designer",
          "Production",
        ]);
      }

      const { data, error } = await query.order("first_name");
      if (error) throw error;
      if (!data) return [];

      return data.map((u: any) => ({
        userId: u.id,
        displayName: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
        userRole: u.role,
      }));
    }

export const chat = {
  formatChatTimestamp,
  getConversations: chat_getConversations,
  getUnreadCount: chat_getUnreadCount,
  markMessagesViewed,
  initUserId: chat_initUserId,
  getMessages: chat_getMessages,
  sendMessage: chat_sendMessage,
  uploadChatImage: chat_uploadChatImage,
  subscribeToMessages,
  getPotentialRecipients: chat_getPotentialRecipients
};

export async function getCart() {
    const { data, error } = await supabase
      .from("cart_items")
      .select(
        "*, product:product_id(id, name, description, category, size_spec, variant, final_price)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

export async function addToCart(
    productId: string,
    quantity: number = 1,
    forceNewRow: boolean = false,
    specifications?: string,
    fileUrl?: string,
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (!forceNewRow) {
      const { data: existingList, error: queryErr } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("customer_id", user.id)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!queryErr && existingList && existingList.length > 0) {
        const existing = existingList[0];
        const { data, error } = await supabase
          .from("cart_items")
          .update({
            quantity: existing.quantity + quantity,
            specifications,
            file_url: fileUrl,
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    }

    const { data, error } = await supabase
      .from("cart_items")
      .insert([
        {
          customer_id: user.id,
          product_id: productId,
          quantity,
          specifications,
          file_url: fileUrl || null,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

export async function updateCartItem(
    cartItemId: string,
    updates: {
      quantity?: number;
      specifications?: string;
      fileUrl?: string;
      file_url?: string;
    },
  ) {
    const dbUpdates: any = { ...updates };
    if ("fileUrl" in dbUpdates) {
      dbUpdates.file_url = dbUpdates.fileUrl;
      delete dbUpdates.fileUrl;
    }

    const { data, error } = await supabase
      .from("cart_items")
      .update(dbUpdates)
      .eq("id", cartItemId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

export async function removeCartItem(cartItemId: string) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", cartItemId);
    if (error) throw error;
  }

export async function clearCart() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("customer_id", user.id);
    if (error) throw error;
  }

export async function checkout(specialInstructions?: string, dueDate?: string, itemIds?: string[]) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    let cartItems = await getCart();
    if (itemIds && itemIds.length > 0) {
      cartItems = cartItems.filter((ci) => itemIds.includes(ci.id));
    }

    if (!cartItems.length) throw new Error("Cart is empty or no items selected");

    const order = await orderDb.createOrder({
      customer_id: user.id,
      order_type: "online",
      special_instructions: specialInstructions,
      due_date: dueDate,
      design_file_url: cartItems[0]?.file_url,
      items: cartItems.map((ci) => ({
        product_id: ci.product_id,
        product_name: ci.product?.name || "Unknown",
        quantity: ci.quantity,
        unit_price: parseFloat(ci.product?.final_price || "0"),
        specifications: ci.specifications,
        file_url: ci.file_url,
      })),
    });

    if (itemIds && itemIds.length > 0) {
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .in("id", itemIds);
      if (error) throw error;
    } else {
      await clearCart();
    }

    return order;
  }

export async function getCatalogProducts(filters?: { category?: string; search?: string }) {
    let query = supabase
      .from("product_catalog_view")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("name");

    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.search) {
      const cleanSearch = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export const crmDb = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  checkout,
  getCatalogProducts,
  chat
};
