# GameOn — CHANGELOG

## 2026-04-30 — Prompt 13 follow-up: Cancelled-count fix

### Bug fix
- `backend/routes/groups.py::upcoming_q` now excludes `status: "CANCELLED"`
  so `matches_count` (used for "X мача" в GroupCard) и `matches_list` вече
  не броят отменените мачове.
- Същият фикс в discover endpoint (`upcoming_count`/`next_match` заявки).

### Verified
- Live test: MatchTest-ebf2de беше 6 → cancel 1 мач → веднага се оправи на 5.
  Cancelled matches вече не се показват изобщо в `matches_list`.

## 2026-04-29 — Prompt 13: Visual Overhaul + Bugfix + UX

### Bug fixes
- WeeklyStats counter (`my.tsx::calcWeek`) now excludes `status==='CANCELLED'`
  matches and only counts upcoming (>= now) for the current week.
- Backend `routes/groups.py` matches_list query was using uppercase `"GOING"` /
  `"WAITLIST"` — DB stores lowercase. Fix: lowercase queries → `going_count`
  and `waitlist_count` are now correct.
- `user_rsvp_status` returned by `/api/groups/my` is now lowercase ("going")
  matching the rest of the API.

### New backend endpoint
- `DELETE /api/matches/{id}` — OWNER-only hard delete; cascades rsvps +
  chat_messages + push_log.

### New frontend components
- `src/components/Avatar.tsx` — hashed-color initials avatar + `AvatarStack`.
- `src/components/MatchActionsMenu.tsx` — bottom-sheet ⋮ menu with
  Edit / Cancel / Stop-Recurrence / Delete; opens via `match-menu-open`.
- `src/utils/webAnimations.ts` — global CSS keyframes (`go-fade-in-up`,
  `go-pulse`, `go-bounce`, `go-shimmer`) for guaranteed-visible web animations.

### Rewrites / overhauls
- `GlassCard.tsx` — proper iOS shadow + Android elevation + web `box-shadow`
  with backdrop-filter; new `active` and `glow` props.
- `MatchCard.tsx` — rich layout with header icon + date chip, location + time
  with Ionicons, divider, capacity progress bar (color-coded by % full),
  inline `AvatarStack`, weekly-recurrence pill, ✓Записан glow when going.
- `WeeklyStats.tsx` — Ionicons (football, checkmark) next to numbers.
- `GroupCard.tsx` — football/people icons next to counts; PRO/TRIAL/FREE
  badges now have inline icons (star/rocket/lock-open) and subtle border.
- `room/[id].tsx` — selector pills now show day-short + date + time +
  cancelled-dim; ⋮ menu integrated; tab buttons gained Ionicons.
- `TeamsTab.tsx` — big team-vs-team score counter (N vs M), 👑 emoji crown
  for captains, dedicated locked-state overlay.
- `PlayersTab.tsx` / `ChatTab.tsx` — switched to Avatar component everywhere.
- `app/_layout.tsx` — root background subtle radial gradient on web; CSS
  animations injected on mount.
- `SkeletonCard.tsx` — added web CSS pulse fallback.

### Backend additions
- `routes/groups.py` matches_list now serialises: `status`, `recurrence`,
  `pricing_mode`, `player_limit`, `waitlist_count`, `going_names` (top 5 going
  with name+user_id+is_guest for inline avatars).

### Verified
- 5/5 new prompt-13 backend tests pass (`backend/tests/test_prompt13.py`).
- Frontend smoke at 414×896 mobile viewport: login → /my, /room/[id], ⋮ menu,
  Чат tab, Отбори tab all render correctly with new design.

## 2026-04-26 — Prompts 1-12
See PRD.md history for the full feature ship-list (auth, groups, matches,
RSVP, payments, results, teams, chat, listings, admin, push, IAP, EAS Build,
visual polish + store metadata).
