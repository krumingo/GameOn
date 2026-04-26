# FootBallChat — PRD

## Original Problem Statement
ПРОМПТ 1 — Backend фундамент: DB + Auth + Groups + Memberships
Приложение за организиране на любителски футболни мачове — групи, записване, делене на отбори, плащания, статистика, маркетплейс. Валута: EUR.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB), JWT auth (HS256, 30-day), OTP via Twilio with dev fallback "123456"
- **DB**: MongoDB collections: users, groups, memberships, otp_codes, guests, billing
- **Project layout**:
  - `backend/server.py` — app, lifespan, indexes, CORS, router registration
  - `backend/deps.py` — DB ref, JWT, models, role/plan helpers, constants
  - `backend/services/membership_service.py` — shared queries + guest merge
  - `backend/routes/auth.py` — OTP start/verify/join, super-test-login, /api/me
  - `backend/routes/groups.py` — groups CRUD + my + public + categories + preview
  - `backend/routes/memberships.py` — members + guests management

## Implemented (2026-04-26) — PROMPT 1
- [x] MongoDB lifespan, indexes (unique phone, unique entry_code, 2dsphere on location.point, TTL on otp_codes.expires_at)
- [x] OTP flow with rate-limit (5/h) + 60s cooldown, dual-mode SMS (Twilio or dev fallback "123456")
- [x] JWT create/verify, `get_current_user_impl` Depends middleware
- [x] /api/auth/start, /verify, /join, /super-test-login
- [x] /api/me GET + PATCH (name/nickname/email/location)
- [x] /api/groups CRUD: my, public (geo $near), POST, /join, GET {id}, PATCH {id}
- [x] FREE plan limit (max 1 OWNER group), auto 14-day TRIAL on creation
- [x] Configurable points_config (Win/Draw/Loss) with validation
- [x] Cash categories: defaults + add (POST /categories) + deactivate (DELETE /categories/{cat})
- [x] /api/groups/preview-by-code (no auth)
- [x] Memberships: list, members (incl. guests), add member, add guest, remove, role change
- [x] Reliability score (100 default) + stats schema
- [x] Guest merge: registering with same phone moves rsvps/goals/payments and removes the guest
- [x] Phone masking, E.164 validation
- [x] Currency EUR enforced

## Implemented (2026-04-26) — PROMPT 2 (matches module)
- [x] Indexes: matches(group_id+start_datetime DESC, status, recurrence_series_id), rsvps((match_id+user_id) unique sparse), cash_transactions(group_id+created_at DESC)
- [x] Match CRUD with all 4 pricing modes (FIXED/SPLIT/SPLIT_WITH_CASH/CASH_PAYS_ALL) + planned_price_per_player computation; FREE plan player_limit cap
- [x] PATCH match (recalc on changes), validation against current going_count, cancel keeps doc in history
- [x] List upcoming + history (with pagination)
- [x] RSVP: going/not_going/waitlist auto-promote; SPLIT recalculation on every change; APPROVAL flow (pending/approve/reject); guest RSVP; bulk RSVP; admin remove
- [x] Late cancellation tracking (<2h before match) updates user.reliability_stats and recomputes score (capped 0..100)
- [x] PRO Payments: /payments view (all 4 modes math, EUR), /payments/mark with OVERPAID detection (overpaid_to_cash), /payments/record-to-cash inserts INCOME (+EXPENSE for SWC) into cash_transactions
- [x] PRO Score (admin) + Results (admin can write any, player can write own only) with cross-validation: BLUE/RED individual sums never exceed score totals; setting lower score blocked if individual sums already exceed
- [x] PRO Teams Draft: set-captains (require both going + reset gating), pick (alternating turn, blocks captain-of-other-team and already-picked), undo-pick, return-player (captains protected), transfer (captains protected, syncs pick_order), lock/unlock, reset (clears teams + player_results, blocked if COMPLETED), set-visibility
- [x] Recurrence WEEKLY: hourly background loop in lifespan, manual /api/scheduler/process-recurrence trigger, /api/matches/{id}/stop-recurrence (whole series), /api/matches/{id}/series listing
- [x] All teams_data, score_data, player_results, player_payments embedded in matches doc (no separate collections)

## Implemented (2026-04-26) — PROMPT 3 (full feature backend)
- [x] **Billing**: Stripe Checkout via emergentintegrations (server-side fixed price 5€/mo), payment_transactions collection, webhook /api/webhook/stripe, GET /billing/group/{id} with plan + features_locked, mark-paid (admin/test), portal stub
- [x] **Cash**: full CRUD, summary with balance/income/expense/categories breakdown/recent_transactions, **player_balances** aggregated from match.player_payments (paid - owed), CSV/JSON export, finance-summary per-match
- [x] **Stats**: my_stats VISIBLE for FREE plan, top_players, recent_matches; leaderboard PRO with metrics points/goals/participations; **leaderboard ALWAYS reads group.points_config (no hardcoded values)** — verified by PATCH test
- [x] **Seasons**: CRUD + set-active (deactivates others, sets group.active_season_id) + close (computes top-3 champions, stores in `champions[]`) + Hall of Fame + delete (blocked if matches reference)
- [x] **Chat**: text+emoji (Unicode), max 2000 chars, member-gated, before-cursor pagination
- [x] **Listings**: 3 types (MATCH_AVAILABLE/LOOKING_FOR_PLAYERS/LOOKING_FOR_TEAM), browse FREE no-auth with geo $near, create PRO admin, respond/accept/reject (auto-RSVP for MATCH_AVAILABLE), close/delete author-only
- [x] **Player search** (PRO admin) by name/phone-suffix with exclude_group; **Invitations** (PRO admin) with accept→membership creation; **Group follows** (FREE) with /me/following + next_match_date
- [x] **Admin panel**: hardcoded login (env ADMIN_EMAIL/ADMIN_PASSWORD), JWT admin token (12h), stats dashboard (revenue from payment_transactions EUR), groups/users/payments listing with filters
- [x] **Dev tools**: /seed-demo-data (11 BG users + 2 groups SPORT26/DIT2026 + 4 matches + 1 closed season with HOF + 1 active + 5 cash txns + 2 listings + 3 chat msgs); /reset; /seed-status; index recreation on seed for dev reset DX
- [x] **Health**: GET /api/health returns version + currency + status

## Implemented (2026-04-26) — PROMPT 4 (Frontend foundation)
- [x] **Expo + TypeScript + expo-router** setup, Web target on port 3000 via `yarn start` → `expo start --web --port 3000`
- [x] **DB separation**: backend uses `DB_NAME=gameon_dev` for preview/dev. Tests should use `DB_NAME=gameon_test` (override at test-time). Seed in gameon_dev preserved.
- [x] **EXPO_PUBLIC_API_URL = REACT_APP_BACKEND_URL** (in /app/frontend/.env)
- [x] Dark Glass theme tokens (background.primary=#0A0E14, accent.primary=#3B82F6, status colors)
- [x] **Bulgarian default i18n** with English fallback, all UI text in src/i18n/{bg,en}.json
- [x] **Auth Login** screen: form (name/phone +359 prefilled/group_code uppercase) → OTP step (6 boxes auto-focus, dev banner, 60s resend countdown, auto-submit on 6 digits). Super-test-login outline button bypasses OTP
- [x] **AuthGuard** in _layout.tsx with AsyncStorage persistence; 401 → multiRemove + redirect to /
- [x] **Tabs** (Моя профил / Открий / Статистика) with active accentColor; custom header (brand + bell + avatar initials); FAB '+' opens bottom-sheet (Нов мач / Нова група / Присъедини се)
- [x] **API client** with namespaces for all backend endpoints (auth, groups, matches, billing, cash, stats, seasons, chat, listings, players, dev, admin)
- [x] **Zustand stores**: authStore (login/logout/checkAuth/updateUser persist), themeStore (accentColor persist)
- [x] **ErrorBoundary** + **OfflineBanner** (NetInfo) + **LoadingButton** (haptic + 3 variants)
- [x] Placeholder screens for: my, discover, stats, room/[id], cash, notifications, search-player, billing/success, privacy, terms
- [x] All RN components use `testID` (auto-converted to `data-testid` by react-native-web)

## Implemented (2026-04-26) — PROMPT 5 (My Profile screen)
- [x] **WeeklyStats** card: 'Тази седмица' label + prev/next arrows for offset, two big numbers (мача / записан за), 7-day bars (Пн-Нд) with today highlight
- [x] **GroupCard** (collapsible): GROUP label + name + meta (X мача · Y участници), plan pill (PRO=gold, TRIAL=blue+Xд, GRACE=amber, FREE=gray), expand toggle with chevron, action row (Финанси / Група), embedded MatchCard list (≤5)
- [x] **MatchCard**: time/venue/date headline, capacity badge (X/N), 'X свободни' / 'Чакащи: N' / 'Пълен' / 'Отменен' status, price '≈ EUR/играч' or 'Безплатно' when 0, recurrence pill, edit pencil for organizers, players inline with current user marked '(ти)' in orange
- [x] **MatchCard RSVP**: optimistic toggle with spinner (LoadingButton); going → '✓ Записан' + 'Откажи'; not_going → 'Запиши се'; pending → disabled outline; waitlist → '#N' outline; CANCELLED hides RSVP entirely
- [x] **Calendar add suggestion** on RSVP-going (mobile only) via expo-calendar
- [x] **SeasonBadge** rendered when any group has active_season_name (clicks to Stats tab)
- [x] **Empty state**: football icon + 'Все още нямаш група' + Създай група / Присъедини се buttons
- [x] **GroupActionModal**: create (name input → POST /api/groups) and join (code uppercase → POST /api/groups/join) flows; reused by FAB menu and empty state
- [x] **SettingsModal** (avatar in header opens it): avatar w/ initials, **reliability badge color-graded** (green ≥90, amber ≥70, red <70), name/nickname/email editable + masked phone (read-only), 'Запази профил' → PATCH /api/me + authStore.updateUser persist + Alert
- [x] Settings: 8-color **accent picker** (white ring on selected) — instant theme update across tab bar / FAB / avatar; **BG/EN language toggle**; terms/privacy links; **logout** with confirmation (web window.confirm, native Alert), 60px+ separation from color picker
- [x] FAB sheet wired to `/(tabs)/my?action=newGroup|joinGroup` deep-link → opens modal in correct mode

## Backlog — Future PROMPTs
- **P0** Matches: create/list, RSVP, capacity & free-spots, recurring matches, scheduler
- **P0** Splits & Payments: per-player price, marking paid, cash transactions
- **P1** Stats / Leaderboard reading from group.points_config
- **P1** Seasons (active_season_id), goals tracking
- **P1** Chat per group/match
- **P1** Marketplace listings (find game / find players / find team)
- **P1** Push notifications (Expo)
- **P2** Admin panel, dev endpoints, exports
- **P2** Stripe billing (PRO upgrade)
- **P2** Reliability score automation (RSVP vs attended, late cancellations)

## Next Action Items
1. PROMPT 2 — Matches & RSVP module
2. PROMPT 3 — Splits, payments, cash management
3. Frontend (React/Expo) implementation
