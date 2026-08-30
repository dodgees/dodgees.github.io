/**
 * Public client config for Family Fit (static SPA).
 *
 * Safe to commit: only the Supabase project URL and anon (public) key.
 * NEVER put the service_role key here — it bypasses RLS.
 *
 * Captain: values come from Supabase → Project Settings → API
 * (Project URL + anon / publishable key).
 */
window.FAMILY_FIT_CONFIG = {
  supabaseUrl: "https://cwyccdbbbqdpbdonjzrx.supabase.co",
  supabaseAnonKey: "sb_publishable_huilKeNXm89qfo7KyNtc6Q_ZU1Az5PO",
};
