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

### PROMPT 8 (Iteration A) — Admin Panel + 4 audit fixes + Billing Success + Legal (2026-04-26)
- **FIX 1 — Transfer button** in TeamsTab next to each non-captain player (transfer-{id} swap-horizontal + return-{id} close).
- **FIX 2 — Hall of Fame** section in Stats (PRO) loading seasonsApi.getHallOfFame() with gold/silver/bronze medals + points + coefficient per closed season.
- **FIX 3 — Cash Export** icon button in /cash header (PRO+admin) → CSV/JSON download via fetch with Authorization header → blob download on web.
- **FIX 4 — points_config display** under leaderboard ('Точкуване: Победа=X, Равен=Y, Загуба=Z').
- **`/admin/login`**: shield icon + email + password (with eye toggle) → POST /api/admin/login → stores admin_token (12h TTL).
- **`/admin/dashboard`**: 6 stat cards (users/groups/active matches/PRO/FREE/Trial) + revenue card (€) + signups/matches last-7-days + nav buttons.
- **`/admin/groups`**: search input + 4 plan filter chips + paginated list with plan pill + detail Alert.
- **`/admin/users`**: search input + paginated list with masked phone + reliability score badge (color-graded) + detail Alert.
- **`/billing/success?session_id=`**: 2s polling up to 30s with 4 states (checking/paid/pending/error) + retry button.
- **`/privacy`** + **`/terms`**: 7+8 sections in Bulgarian, Dark Glass formatting.
- **AuthGuard** correctly skips /admin/* segment; **apiClient** auto-attaches admin_token for /admin/* paths and falls back to user token elsewhere.
**Tests: 21/21 backend + 100% frontend testIDs (iteration_8.json).**

## Backlog — Future PROMPTs

### PROMPT 8 (Iteration B) — pending
- **P1** Push Notifications: backend register-token + update-prefs endpoints + Expo Notifications integration (foreground listener, response listener, channels for matches/chat/system); UI toggles in `/notifications` for new_matches/reminders/reminder_hours/rsvp_changes/chat.
- **P1** Error Handling enhancements: 403 PLAN_PRO_REQUIRED → global PaywallOverlay event bus; 500 → "Сървърна грешка" alert with retry; Retry logic for RSVP/payments/score (max 3 retries).

### Long-term
- **P2** Reliability score automation (RSVP vs attended tracking)
- **P3** Map view in Discover with `react-native-maps` + GPS radius slider
- **P3** Recurring weekly listing auto-archive
- **P3** In-app payment receipts download

## Test Credentials
See `/app/memory/test_credentials.md`. Super test phone: `+359888999999`.

## Next Action Items
1. **P1** PROMPT 8 Iteration B — Push Notifications (Expo + backend register-token / push_prefs endpoints)
2. **P1** PROMPT 8 Iteration B — Global error handling (paywall event bus + retry logic for critical APIs)
3. **P2** Reliability score automation (RSVP vs attended)
