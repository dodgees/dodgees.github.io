# Family Fit — known gaps

Product gaps that can negatively affect family members using `/family-fit/`.
This is not a roadmap; it is a frank inventory of missing functionality relative to the current feature set.

## Current feature set (brief)

- Email/password create account and sign in
- Display name and profile photo
- Log weigh-ins and exercise (activity, minutes, optional note, date)
- Personal progress (start → latest weight, total lost/gained, exercise minutes; 30-day window)
- Competition board with sort by exercise or weight change
- Recent entries feed (family-wide)
- Encouragement: comments and emoji reactions on entries
- PWA install to home screen
- Anyone with the URL can join; signed-in members can read everyone’s logs (RLS blocks anonymous)

## Gaps that hurt users

### 1. No self-serve password reset

Forgot password requires asking the captain to reset it in the Supabase dashboard. High friction for non-technical family members and blocks sign-in until someone intervenes.

### 2. Open signup (no invite gate)

Anyone who has the Family Fit URL can create an account and then see all weigh-ins and exercise logs. Acceptable while the link stays private; painful if the URL is shared or leaked.

### 3. Members cannot edit or delete their own logs

Wrong weight, bad date, or typo on an exercise entry cannot be fixed in the app. Correction today means captain work in Supabase (or living with the mistake). This will come up in normal use.

### 4. No notifications or reminders

Encouragement and competition only work when people open the app. There are no push notifications, email nudges, or “log today” reminders, so participation can quietly drop.

### 5. Fixed 30-day window only

Personal progress and the board use the same rolling ~30-day window. There is no full-competition history, weekly view, or custom date range. Longer competitions lose early progress context.

### 6. Recent entries are capped and not real-time

The feed shows a short slice of recent activity and does not live-update. Comments and reactions from others generally need a refresh to appear. Easy to miss family activity.

### 7. No goals, streaks, or team rules

The board ranks exercise minutes and weight change, but there are no target weights, weekly minute goals, streaks, or “did you log today?” accountability beyond the leaderboard itself.

### 8. Captain-only operations

Schema/migrations, password resets, and account cleanup are dashboard work. Fine for the captain; invisible or confusing for everyone else when something breaks (e.g. missing columns, auth issues).

## Highest-impact next slices

If prioritizing fixes that reduce real user pain:

1. Self-serve password reset
2. Edit/delete own weigh-ins and exercise logs

Then consider invite gating, notifications, and richer history/goals as product expansion rather than firefighting.
