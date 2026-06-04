// Generated database service file
import { supabase } from '@/config/supabaseClient';

export async function getUsers(filters?: { role?: string; status?: string }) {
    let query = supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    if (filters?.role) query = query.eq("role", filters.role);
    if (filters?.status === "active") query = query.eq("is_active", true);
    if (filters?.status === "inactive") query = query.eq("is_active", false);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

export async function updateLastSeen() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
    } catch (e) { console.error("Failed to update last seen", e); }
  }

export async function logAudit(action: string, table: string, id: string, metadata: any) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
      await supabase.from('audit_logs').insert([{
        actor_id: user.id,
        actor_role: profile?.role || 'unknown',
        action,
        target_table: table,
        target_id: id,
        metadata
      }]);
    } catch (e) { console.error("Audit log failed:", e); }
  }

export async function notifyRoles(roles: string[], title: string, message: string, module?: string, id?: string) {
    try {
      const { data: users } = await supabase.from('users').select('id').in('role', roles);
      if (!users || users.length === 0) return;
      const notifs = users.map(u => ({
        user_id: u.id,
        title,
        message,
        related_module: module,
        related_id: id
      }));
      await supabase.from('notifications').insert(notifs);
    } catch (e) { console.error("Notification failed:", e); }
  }

export async function notifyUser(userId: string, title: string, message: string, module?: string, id?: string) {
    try {
      await supabase.from('notifications').insert([{
        user_id: userId, title, message, related_module: module, related_id: id
      }]);
    } catch (e) { console.error("User notification failed:", e); }
  }

export async function getEmployees() {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("employee_code");
    if (error) throw error;
    return data || [];
  }

export async function createEmployee(emp: {
    employee_code?: string;
    full_name: string;
    position: string;
    role?: string;
    base_hourly_rate?: number;
    hire_date?: string;
    // FIX: per-employee PhilHealth and HDMF contributions (replacing auto-calc and fixed ₱200)
    philhealth_contribution?: number;
    hdmf_contribution?: number;
  }) {
    const { data, error } = await supabase
      .from("employees")
      .insert([
        {
          ...emp,
          is_active: true,
          base_hourly_rate: emp.base_hourly_rate || 0,
          hire_date: emp.hire_date || new Date().toISOString().split("T")[0],
          philhealth_contribution: emp.philhealth_contribution ?? 0,
          hdmf_contribution: emp.hdmf_contribution ?? 0,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    await logAudit("Create Employee", "employees", data.id, { name: data.full_name, position: data.position });
    return data;
  }

export async function updateEmployee(id: string, updates: Record<string, any>) {
    const { data, error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await logAudit("Update Employee", "employees", id, { updates });
    return data;
  }

export async function getStaffList() {
    const { data, error } = await supabase
      .from("users")
      .select("id, first_name, last_name, role")
      .in("role", ["designer", "production", "admin"])
      .eq("is_active", true)
      .order("role")
      .order("first_name");
    if (error) throw error;
    return data || [];
  }

export const adminDb = {
  getUsers,
  updateLastSeen,
  logAudit,
  notifyRoles,
  notifyUser,
  getEmployees,
  createEmployee,
  updateEmployee,
  getStaffList
};
