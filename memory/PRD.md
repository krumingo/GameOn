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
