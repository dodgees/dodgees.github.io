# Family Fit

Invite-only family weight-loss / healthy-living competition mini-app, served as a static sub-app at `/family-fit/` on this GitHub Pages site. Auth and data live in Supabase (Postgres + Auth). The frontend is vanilla HTML/CSS/JS — no build step.

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
3. Confirm tables `profiles`, `weigh_ins`, and `exercise_logs` exist under **Table Editor**.

Safe to re-run later: the script uses `IF NOT EXISTS` / `DROP POLICY IF EXISTS`, and it **backfills** `profiles` for any `auth.users` who were invited before the trigger existed (or otherwise lack a profile row). Re-run the same file if a member can sign in but cannot save a display name or log weigh-ins.

### 3. Disable public self-signup (invite-only)

1. Go to **Authentication → Providers → Email**.
2. Turn **off** “Enable sign ups” (wording may be “Allow new users to sign up”).
3. Keep email/password (or magic link) enabled for invited users who already have accounts.

Family members cannot create accounts themselves. Only the captain invites them.

### 4. Wire public config

Edit [`config.js`](./config.js) (committed public config — anon key only):

```js
window.FAMILY_FIT_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

[`config.example.js`](./config.example.js) is a template if you need to recreate the file.

### 5. Invite family members

1. **Authentication → Users → Invite user** (or “Add user” / invite by email).
2. Send the invite email for each family member.
3. New invites get a `profiles` row from the auth trigger in `schema.sql`. If someone was invited before you ran the schema, re-run `schema.sql` so the backfill creates their profile.
4. They can set a friendly display name in the app after sign-in.

Optional: when inviting via the Admin API / dashboard, set user metadata `display_name` so the profile starts with a nicer name.

### 6. Auth URL allow-list (local + production)

Under **Authentication → URL Configuration**:

- **Site URL**: `https://www.erikdodge.com/family-fit/` (or your Pages URL).
- **Redirect URLs**: include production and local preview, e.g.
  - `https://www.erikdodge.com/family-fit/`
  - `https://dodgees.github.io/family-fit/`
  - `http://127.0.0.1:5500/family-fit/`
  - `http://localhost:5500/family-fit/`

## Local / preview

From the repo root (or open `family-fit/index.html` via any static server):

```bash
# example — any static file server works
npx --yes serve -l 5500 .
# then open http://127.0.0.1:5500/family-fit/
```

If `config.js` is empty, the app shows a setup message instead of talking to Supabase.

## What the app does

| Feature | Who |
| --- | --- |
| Sign in | Invited family only |
| Log weight | Own entries only (write) |
| Log exercise | Own entries only (write) |
| Competition board | Signed-in family can read everyone’s progress |

Anonymous visitors cannot read weigh-ins or exercise logs (RLS; no policies for `anon`).

## Schema overview

- **profiles** — `id` = `auth.users.id`, `display_name`
- **weigh_ins** — `user_id`, `weight_lbs`, `recorded_on`, optional `note`
- **exercise_logs** — `user_id`, `activity`, `duration_minutes`, `recorded_on`, optional `note`

Full DDL + RLS: [`schema.sql`](./schema.sql).

## Security notes

- Commit only the **anon** key in `config.js`. Rotate it in Supabase if it ever leaks alongside a misconfigured RLS policy.
- Never commit `.env` files containing `service_role`.
- Health data is sensitive: keep signup invite-only and leave RLS enabled.
