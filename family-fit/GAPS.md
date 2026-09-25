# Family Fit — known gaps

Product gaps that can negatively affect family members using `/family-fit/`.
This is not a roadmap; it is a frank inventory of missing functionality relative to the current feature set.

## Current feature set (brief)

- Email/password create account (invite code required), sign in, and self-serve **Forgot password?** reset
- Display name and profile photo
- Log weigh-ins and exercise (activity, minutes, optional note, date); edit or delete your own from Recent entries
- Personal progress (start → latest weight, total lost/gained, exercise minutes; shared history window)
- Competition board with sort by exercise or weight change and selectable history window (7 / 30 / 90 / all-time)
- Recent entries feed (family-wide)
- Encouragement: comments and emoji reactions on entries
- PWA install to home screen
- Create account needs the captain’s shared invite code; signed-in members can read everyone’s logs (RLS blocks anonymous)

## Gaps that hurt users

### 1. ~~No self-serve password reset~~ (done)

Self-serve **Forgot password?** is in the app: members request a reset email and set a new password via the recovery link back into `/family-fit/`. Captain dashboard recovery remains a fallback only.

### 2. Invite gate is a public shared secret (not server-enforced)

Create account checks `FAMILY_FIT_CONFIG.inviteCode` in the client. That stops casual signup from a leaked URL, but anyone who can read `config.js` (or the page source) still knows the code. Acceptable for a family app; rotate the code in config when it leaks. Turning off Supabase “Enable sign ups” would break this Create account path.

### 3. ~~Members cannot edit or delete their own logs~~ (done)

Own weigh-ins and exercise logs can be edited or deleted from Recent entries (Edit opens the log form; Delete confirms and removes the entry plus its comments/reactions).

### 4. No notifications or reminders

Encouragement and competition only work when people open the app. There are no push notifications, email nudges, or “log today” reminders, so participation can quietly drop.

### 5. No custom date range or weekly goals view

Members can pick 7 / 30 / 90 / all-time for personal progress and the board, but there is still no arbitrary custom range, calendar week view, or goal-period breakdown.

### 6. Recent entries are capped and not real-time

The feed shows a short slice of recent activity and does not live-update. Comments and reactions from others generally need a refresh to appear. Easy to miss family activity.

### 7. No goals, streaks, or team rules

The board ranks exercise minutes and weight change, but there are no target weights, weekly minute goals, streaks, or “did you log today?” accountability beyond the leaderboard itself.

### 8. Captain-only operations

Schema/migrations and account cleanup are dashboard work. Fine for the captain; invisible or confusing for everyone else when something breaks (e.g. missing columns, auth email delivery). Password reset is self-serve in the app.

## Highest-impact next slices

If prioritizing fixes that reduce real user pain:

1. Notifications or “log today” reminders
2. Custom date ranges / weekly goals view

Then consider streaks and richer team rules as product expansion rather than firefighting.
