// Generated database service file
import { supabase } from '@/config/supabaseClient';

export async function getMyProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();
    return data;
  }

export async function updateMyProfile(updates: {
    first_name?: string;
    last_name?: string;
    contact_number?: string;
    address?: string;
    email?: string;
    avatar_url?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      await supabase.auth.updateUser({
        data: { first_name: updates.first_name, last_name: updates.last_name },
      });
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

export async function updateMyPassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

export async function uploadProfilePicture(
    file: File,
    oldUrl?: string,
): Promise<string> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024)
        throw new Error("File size exceeds 2MB limit");

    // 1. Prepare new file info
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    // 2. Upload new file
    const { error: uploadError } = await supabase.storage
        .from("user-profile")
        .upload(fileName, file, {
            cacheControl: "3600",
            upsert: true,
        });

    if (uploadError) {
        console.error("Error uploading profile picture:", uploadError);
        throw uploadError;
    }

    // 3. Delete old file if it exists and belongs to the 'user-profile' bucket
    if (oldUrl && oldUrl.includes("user-profile/")) {
        try {
            const oldPath = oldUrl.split("user-profile/").pop();
            if (oldPath) {
                await supabase.storage.from("user-profile").remove([oldPath]);
                console.log("Successfully removed old avatar from storage:", oldPath);
            }
        } catch (deleteError) {
            console.warn("Failed to delete old profile picture:", deleteError);
        }
    }

    const {
        data: { publicUrl },
    } = supabase.storage.from("user-profile").getPublicUrl(fileName);

    return publicUrl;
}

export const authDb = {
  getMyProfile,
  updateMyProfile,
  updateMyPassword,
  uploadProfilePicture
};
