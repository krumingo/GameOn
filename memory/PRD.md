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

### PROMPT 9 (Iteration A) — Push Notifications + Error Handling + Share + Performance (2026-04-26)
- **Backend**: services/push_service.py (Expo Push API + group/match token resolvers); routes/push.py (POST /push/register-token + DELETE + GET/PUT /push/prefs + dev /push/test); push hooks fire-and-forget in matches.py for RSVP toggle, new match create, and match cancel — all wrapped in try/except so they never block the response.
- **Frontend Push setup** (utils/push.ts): web-safe (no-op on Platform.OS==='web'); registerForPushAsync auto-prompts permission + registers token after login on native; Android channels (matches/chat/system); foreground handler; deep-link router based on notification.data.type.
- **Notification preferences UI** in /notifications: 4 toggles (new_matches/reminders/rsvp_changes/chat) + conditional reminder_hours block (1h/2h/1ден/2дни) + Save button → PUT /api/push/prefs.
- **Error handling**: utils/events.ts tiny emitter; client.ts 403 detail.code='PLAN_PRO_REQUIRED' → events.emit('showPaywall') → GlobalPaywall modal in _layout.tsx; 500 errors → Alert 'Сървърна грешка' (or console.warn on web).
- **Retry**: utils/retry.ts withRetry exponential backoff (skips 4xx); applied to RSVP toggle, payments/mark, score set.
- **Share Group Modal** (ShareGroupModal.tsx): big entry_code text + copy-code + copy-link + native share (Web Share API fallback to Clipboard); integrated as group-share-{id} button on /(tabs)/my GroupCard and room-share button on room/[id] header.
- **Performance**: React.memo on MatchCard and GroupCard.
**Tests: 15/15 backend (1 skip data-related) + 100% frontend testable on web (iteration_9.json + /app/backend/tests/test_prompt9.py).**

### PROMPT 10 — Production Deploy Prep (2026-04-26)
- **Reminder Cron** (services/reminder_service.py): `check_and_send_reminders()` scans UPCOMING matches in next 48h, finds `going` RSVPs, filters by `push_prefs.reminders/reminder_hours`, fires within ±5min trigger window, dedupes via `push_log` collection (unique compound index on match_id+user_id+type). Runs every 5 min as `reminder_background_loop` in lifespan alongside `recurrence_background_loop`.
- **IAP stub**: POST /api/billing/validate-iap-receipt (returns valid:false until real Apple/Google validation wired); frontend `src/services/iap.ts` with `getProductId()` + `startPurchase()` routing all platforms through Stripe checkout for now.
- **EAS Build config**: `eas.json` with development/preview/production profiles + submit config for both stores; `app.json` upgraded with bundleIdentifier=com.gameon.app, versionCode/buildNumber, expo-notifications/expo-calendar/expo-location plugins, scheme='gameon', splash + icon paths.
- **Placeholder Assets** (Pillow-generated): icon.png 1024×1024, splash.png 1284×2778, adaptive-icon.png 1024×1024, notification-icon.png 96×96, favicon.png 64×64. (`assets/_README.md` notes they must be replaced before store submission.)
- **Deep linking**: app/index.tsx pre-fills group code from `?code=XXX` query param (via useLocalSearchParams) or cold-start `gameon://join?code=XXX` (via Linking.getInitialURL).
- **Production env**: `backend/.env.example` template; `/app/.gitignore` excludes `.env*` (with `!.env.example` allowlist) and Google service-account JSONs; `/app/memory/DEPLOY_CHECKLIST.md` runbook for backend, frontend, App Store, Google Play, post-deploy verification, and future native-IAP migration.
**Tests: 13/13 prompt10 backend + 50/51 regression PASS (1 expected SKIP) + 100% frontend testable (iteration_10.json + /app/backend/tests/test_prompt10.py).**

## Backlog — Future PROMPTs

### PROMPT 9 (Iteration B) — pending
- **P2** FlatList migration for PlayersTab, ChatTab, Admin lists.
- **P2** UI polish pass: skeleton loaders + Toast/Snackbar for web success messages.

### PROMPT 11 — Native IAP (post App-Store submission)
- **P1** Switch from Stripe-in-WebView to native IAP (`expo-in-app-purchases` or `react-native-iap`)
- **P1** Real Apple/Google receipt validation in `/api/billing/validate-iap-receipt`
- **P1** Restore-purchase flow + receipt re-validation on app start

### Long-term
- **P2** Reliability score automation (RSVP vs attended tracking)
- **P3** Map view in Discover with `react-native-maps` + GPS radius slider
- **P3** Recurring weekly listing auto-archive
- **P3** In-app payment receipts download
- **P3** App Store screenshots automation script

## Test Credentials
See `/app/memory/test_credentials.md`. Super test phone: `+359888999999`.

## Next Action Items
1. **Pre-submit** Replace EAS placeholder ids in app.json (`extra.eas.projectId` + `updates.url`) with real values from `eas build:configure`
2. **Pre-submit** Replace placeholder PNGs in `/app/frontend/assets/` with final designs
3. **P1** PROMPT 11 — Native IAP migration (required for App Store approval)
4. **P2** PROMPT 9 Iteration B — FlatList migration + UI polish + Toast/Snackbar
