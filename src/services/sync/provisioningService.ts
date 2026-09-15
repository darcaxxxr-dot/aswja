import { getSupabaseClient } from './supabaseClient';
import { readActiveSchoolId } from '@utils/device';
import { authService, type AppUser } from '@services/auth/index';

export interface ProvisionResult {
  ok: boolean;
  status: string;
  message: string;
}

/**
 * Binds the authenticated user's profile to the given School ID via the
 * `provision_school_for_current_user` RPC (migration 008). The RPC also
 * creates the school row in the cloud if it does not exist yet.
 *
 * Without this call, profiles.school_id stays NULL (handle_new_user does not
 * set it), so get_user_school() returns NULL and every authenticated upsert
 * fails RLS with 42501 "new row violates row-level security policy".
 *
 * The base RPC refuses when the profile is already assigned to a different
 * school. SUPERUSER callers fall back to `admin_provision_school`, which may
 * re-assign the profile — needed to self-heal devices linked to a school
 * other than the one their profile was provisioned with.
 *
 * @param schoolId - The target school ID. Falls back to device's local school ID.
 * @param user - Optional AppUser object to check role without additional RPC call.
 */
export async function provisionCurrentSchool(schoolId?: string, user?: AppUser | null): Promise<ProvisionResult> {
  const targetSchoolId = schoolId ?? readActiveSchoolId();
  if (!targetSchoolId) {
    return { ok: false, status: 'no_school', message: 'School ID aktif belum tersedia.' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, status: 'no_client', message: 'Supabase belum dikonfigurasi.' };
  }
  try {
    // Check if user is SUPERUSER — if so, use admin RPC directly
    const currentUser = user ?? await authService.getCurrentUser();
    if (currentUser?.role === 'SUPERUSER') {
      return await adminProvisionSchool(targetSchoolId, currentUser.id);
    }
    const { data, error } = await client.rpc('provision_school_for_current_user', {
      p_school_id: targetSchoolId
    });
    if (error) {
      return { ok: false, status: 'rpc_error', message: error.message };
    }
    const row = Array.isArray(data) ? data[0] : (data as { status?: string; message?: string } | null);
    const status = row?.status ?? 'unknown';
    const message = row?.message ?? '';
    if (status === 'provisioned' || status === 'already_provisioned') {
      return { ok: true, status, message };
    }
    if (status === 'error' && /different school/i.test(message)) {
      // Non-SUPERUSER with conflict — cannot re-assign
      return { ok: false, status: 'conflict', message };
    }
    return { ok: false, status, message };
  } catch (err: unknown) {
    return { ok: false, status: 'exception', message: err instanceof Error ? err.message : String(err) };
  }
}

async function adminProvisionSchool(schoolId: string, targetUserId: string): Promise<ProvisionResult> {
  const user = await authService.getCurrentUser();
  if (!user) {
    return { ok: false, status: 'no_user', message: 'User tidak ditemukan.' };
  }
  try {
    const { data, error } = await getSupabaseClient()!.rpc('admin_provision_school', {
      p_school_id: schoolId,
      p_target_user_id: targetUserId
    });
    if (error) {
      return { ok: false, status: 'admin_rpc_error', message: error.message };
    }
    const row = Array.isArray(data) ? data[0] : (data as { status?: string; message?: string } | null);
    const status = row?.status ?? 'unknown';
    const message = row?.message ?? '';
    if (status === 'provisioned' || status === 'already_provisioned') {
      return { ok: true, status: `admin_${status}`, message };
    }
    return { ok: false, status: `admin_${status}`, message };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 'admin_exception', message: msg };
  }
}
