/**
 * Public client config for Family Fit (static SPA).
 *
 * Safe to commit: only the Supabase project URL and anon (public) key.
 * NEVER put the service_role key here — it bypasses RLS.
 *
 * Captain: copy config.example.js → config.js (already present) and fill
 * values from Supabase → Project Settings → API.
 */
window.FAMILY_FIT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
