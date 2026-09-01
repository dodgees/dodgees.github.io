# Family Fit

Family weight-loss / healthy-living competition mini-app, served as a static sub-app at `/family-fit/` on this GitHub Pages site. Auth and data live in Supabase (Postgres + Auth). The frontend is vanilla HTML/CSS/JS — no build step.

Anyone with the Family Fit URL can **create an account** with email and password and join the competition board. Share the link only with family.

> ### If you see `column profiles.avatar_path does not exist`
>
> Production was never migrated after profile photos shipped. **Do not dig through the full schema** — run this one-shot fix:
>
> 1. Open Supabase → **SQL → New query**
> 2. Paste **[`migrate-avatar-path.sql`](./migrate-avatar-path.sql)** and **Run**
> 3. Refresh `/family-fit/` — avatars work again; weigh-ins/board keep working either way
>
> That file only adds `profiles.avatar_path`, refreshes the profile update policy, and ensures the private `avatars` Storage bucket + policies exist. Safe to re-run.

## Captain setup (one-time)

### 1. Create a Supabase project

1. Sign in at [https://supabase.com](https://supabase.com) and create a project.
2. Wait until the project is healthy.
3. Open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key  

   Do **not** copy or commit the **service_role** key. It bypasses Row Level Security and must never ship in this static site.

### 2. Run the SQL schema

1. In the Supabase dashboard: **SQL → New query**.
2. Paste the contents of [`schema.sql`](./schema.sql) and run it.
3. Confirm tables `profiles`, `weigh_ins`, and `exercise_logs` exist under **Table Editor**, and that `profiles` has an `avatar_path` column.
4. Confirm **Storage** has a private bucket named **`avatars`** (the SQL creates it; if the insert fails, create it manually — see below).

Safe to re-run later: the script uses `IF NOT EXISTS` / `DROP POLICY IF EXISTS`, and it **backfills** `profiles` for any `auth.users` who lack a profile row. Re-run the same file if a member can sign in but cannot save a display name, upload a profile photo, or log weigh-ins. Exception: the live error `column profiles.avatar_path does not exist` — use the one-shot callout at the top ([`migrate-avatar-path.sql`](./migrate-avatar-path.sql)), not a full `schema.sql` re-run.

#### Avatar storage (if the bucket is missing)

If **Storage → avatars** does not appear after running `schema.sql`:

1. **Storage → New bucket**
2. Name: **`avatars`**
3. **Public bucket**: off (private)
4. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
5. File size limit: **512 KB** (524288 bytes)
6. Re-run the storage policy section at the bottom of [`schema.sql`](./schema.sql) (from the `storage.buckets` insert through the four `avatars_*` policies).

Members upload photos from **Edit profile** in the app. Paths are stored on `profiles.avatar_path`; the competition board shows signed-in family avatars after refresh.

### 3. Enable email / password sign-up

1. Go to **Authentication → Providers → Email**.
2. Ensure **Email** is enabled.
3. Turn **on** “Enable sign ups” (wording may be “Allow new users to sign up”).
4. Optional (smoother family UX): under **Authentication → Providers → Email** (or **Authentication → Settings**), turn **off** “Confirm email” so Create account signs members in immediately. If confirm stays on, new users must click the confirmation link before Sign in works.
5. Keep email/password enabled so existing members can still Sign in.

New accounts get a `profiles` row from the auth trigger in [`schema.sql`](./schema.sql) (same path as older invited users). They can set a display name in the app after sign-in.

### 4. Wire public config

Edit [`config.js`](./config.js) (committed public config — anon key only):

```js
window.FAMILY_FIT_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

[`config.example.js`](./config.example.js) is a template if you need to recreate the file.

### 5. Optional: pre-create or reset accounts

Dashboard invites are optional now (self-serve Create account is the default). You can still:

1. **Authentication → Users → Invite user** (or “Add user”) to pre-create someone.
2. Send a fresh invite / use **Send password recovery** from the Users screen if someone forgets their password — the app has no self-serve reset.

Optional: when creating a user via the Admin API / dashboard, set user metadata `display_name` so the profile starts with a nicer name.

### 6. Auth URL allow-list (local + production)

Under **Authentication → URL Configuration**:

- **Site URL**: `https://www.erikdodge.com/family-fit/` (or your Pages URL).
- **Redirect URLs**: include production and local preview, e.g.
  - `https://www.erikdodge.com/family-fit/`
  - `https://dodgees.github.io/family-fit/`
  - `http://127.0.0.1:5500/family-fit/`
  - `http://localhost:5500/family-fit/`

Needed for email confirmation links (if confirm email is on) and any auth redirects back into the static app.

## Local / preview

From the repo root (or open `family-fit/index.html` via any static server):

```bash
# example — any static file server works
npx --yes serve -l 5500 .
# then open http://127.0.0.1:5500/family-fit/
```

If `config.js` is empty, the app shows a setup message instead of talking to Supabase.

## Add to Home Screen (PWA)

Family Fit ships a web app manifest and icons so members can install it from a phone browser.

- **Android (Chrome):** open `/family-fit/`, tap the menu (⋮), then **Install app** or **Add to Home screen**.
- **iOS (Safari):** open `/family-fit/`, tap **Share**, then **Add to Home Screen**. The icon should show as **Family Fit** with the green dumbbell icon.

Manifest: [`manifest.webmanifest`](./manifest.webmanifest). Icons live in [`icons/`](./icons/).

## What the app does

| Feature | Who |
| --- | --- |
| Create account / Sign in | Anyone with the app URL (email + password); password recovery is captain-assisted in Supabase (no self-serve reset) |
| Profile photo | Upload/replace/remove JPEG, PNG, or WebP (client-resized); shown on profile and board |
| Personal progress | Signed-in member: start → latest weight, total lost/gained, and exercise minutes (same 30-day window as the board) |
| Log weight | Own entries only (write) |
| Log exercise | Own entries only (write) |
| Competition board | Signed-in members can read everyone’s progress; sort by exercise or weight change (choice saved in the browser) |

Anonymous visitors cannot read weigh-ins or exercise logs (RLS; no policies for `anon`).

## Schema overview

- **profiles** — `id` = `auth.users.id`, `display_name`, optional `avatar_path` (Storage object path)
- **weigh_ins** — `user_id`, `weight_lbs`, `recorded_on`, optional `note`
- **exercise_logs** — `user_id`, `activity`, `duration_minutes`, `recorded_on`, optional `note`

Full DDL + RLS: [`schema.sql`](./schema.sql).

## Security notes

- Commit only the **anon** key in `config.js`. Rotate it in Supabase if it ever leaks alongside a misconfigured RLS policy.
- Never commit `.env` files containing `service_role`.
- Health data is sensitive: share the Family Fit URL only with family. Anyone who can create an account becomes an authenticated peer and can read the board (RLS). Leave RLS enabled.
