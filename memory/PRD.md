# FootBallChat — PRD

## Original Problem Statement
Приложение за организиране на любителски футболни мачове — групи, записване, делене на отбори, плащания, статистика, маркетплейс. Валута: EUR. Език: Български. Тема: Dark Glass.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB), JWT auth, OTP via Twilio with dev fallback "123456"
- **Frontend**: Expo (React Native Web) + TypeScript + expo-router + Zustand + i18next + axios
- **DB strategy**: MongoDB; documents embed child arrays (rsvps, payments, results, teams) inside matches; gameon_dev (preview) vs gameon_test (testing agent)

## Implemented (2026-04-26)

### PROMPT 1 — Backend foundation
DB lifespan, auth (OTP + JWT + super-test-login), groups CRUD, memberships, guests, FREE plan limits, points_config, cash_categories, reliability_score, currency EUR.

### PROMPT 2 — Matches module
Matches CRUD with 4 pricing modes (FIXED/SPLIT/SPLIT_WITH_CASH/CASH_PAYS_ALL), RSVP (going/not_going/waitlist auto-promote, APPROVAL flow, guest/bulk RSVP, late cancellation tracking), PRO Payments + Score + Results + Teams Draft (set-captains/pick/undo/return/transfer/lock/reset), WEEKLY recurrence scheduler.

### PROMPT 3 — Full feature backend
Stripe Billing via emergentintegrations (5€/mo), Cash full CRUD + summary + player_balances + CSV export, Stats (my_stats FREE / leaderboard PRO using group.points_config), Seasons + champions + Hall of Fame, Chat per group/match, Listings (3 types) + responses + invitations + group follows, player search PRO, Admin panel, Dev seed.

### PROMPT 4 — Frontend foundation
Expo + TypeScript + expo-router setup, web on port 3000, Dark Glass theme tokens, Bulgarian i18n with EN fallback, Auth Login (OTP + super-test), AuthGuard with AsyncStorage persistence, Tabs (Моя профил / Открий / Статистика), API client namespaces, Zustand stores, ErrorBoundary + OfflineBanner + LoadingButton.

### PROMPT 5 — My Profile
WeeklyStats card, GroupCard collapsible (plan pill, expand chevron), MatchCard (RSVP, capacity, free spots, edit pencil for organizers, calendar add suggestion), GroupActionModal (create/join), SettingsModal (avatar, reliability badge, name/nickname/email + 8-color accent picker + BG/EN toggle + logout).

### PROMPT 6 — Match Room
`/room/[id]` container auto-detects match-id vs group-id; horizontal match selector + selector-new admin pill; PlayersTab (going/pending/waitlist + bulk add + add guest + cancel match); PaymentsTab PRO (4-mode summary + per-player rows + mark-paid modal + record-to-cash); ResultsTab PRO (debounced score controls + per-team goal counters + MVP badge); TeamsTab PRO (captains → draft turn banner → pick/undo/return/lock/reset); ChatTab (polling + optimistic send); CreateMatchModal (4 pricing modes + recurrence + approval + player_limit with FREE 14 cap).
**Tests: 11/11 backend + 100% frontend testIDs (iteration_6.json).**

### PROMPT 7 — Discover / Stats / Cash / Search-Player / Notifications (2026-04-26)
- **`/(tabs)/discover`**: type filter pills (4) + ListingCard list + ListingDetailModal (respond/accept/close) + CreateListingModal + admin-only FAB.
- **`/(tabs)/stats`**: group + season selectors, my-stats grid (8 boxes), leaderboard PRO with metric chips, top players, recent matches.
- **`/cash?groupId=`**: PaywallOverlay on FREE; PRO summary card + categories breakdown + player_balances + transactions list + CreateTxnModal (INCOME/EXPENSE/category/amount/note).
- **`/search-player?groupId=`**: debounced PRO admin search + result cards + invite button.
- **`/notifications`**: invitations inbox with accept/decline.
**Tests: 24/24 backend + 5/5 frontend screens (iteration_7.json).**

## Backlog — Future PROMPTs
- **P2** `/billing/success` — confirmation screen after Stripe checkout
- **P2** `/privacy` + `/terms` — legal pages
- **P2** `/admin/*` — admin panel UI (login, dashboard, groups, users, payments)
- **P2** Push notifications (Expo Notifications)
- **P2** Reliability score automation (RSVP vs attended)
- **P3** Advanced match filters in Discover (date range + radius slider + map view)
- **P3** Recurring weekly listing auto-archive

## Test Credentials
See `/app/memory/test_credentials.md`. Super test phone: `+359888999999`.

## Next Action Items
1. **P2** Implement billing success screen + privacy/terms pages
2. **P2** Implement admin panel UI
3. **P2** Wire push notifications
