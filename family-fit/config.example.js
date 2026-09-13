/**
 * Example public client config for Family Fit.
 * Copy to config.js and fill in values from Supabase → Project Settings → API.
 *
 * Safe to commit: Project URL, anon key, and family inviteCode.
 * Never commit service_role. Invite setup/rotation: README.md.
 */
window.FAMILY_FIT_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  // Required for Create account. Sign-in does not use this. Rotate by editing + redeploying.
  inviteCode: "CHANGE-ME-FAMILY-INVITE",
};
