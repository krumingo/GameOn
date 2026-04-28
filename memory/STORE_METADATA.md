# GameOn — App Store / Google Play Metadata

## App Store (iOS)

**Title**: GameOn — Футболни мачове
**Subtitle**: Организирай, играй, плащай
**Bundle ID**: com.gameon.app
**Category**: Sports
**Age Rating**: 4+
**Languages**: Bulgarian, English

### Description (BG, < 4000 chars)

GameOn е най-лесният начин да организираш футболни мачове с приятели.

🟢 БЕЗПЛАТНО:
• Създай група и покани приятелите си с код
• Организирай мачове с дата, час и място
• Запиши се с едно натискане
• Чат в групата
• Седмична статистика
• Открий мачове наоколо

⭐ PRO (5.00 €/месец):
• Делене на отбори с драфт система
• Плащания и каса — дели разходите
• Резултати, голове и класиране
• Търсене на играчи от други групи
• Обяви „Търся играч / отбор"
• Сезони и Hall of Fame
• Експорт на финанси

🎁 14 дни безплатен PRO trial за нови групи!

Как работи:
1. Регистрирай се с телефон
2. Създай група или се присъедини с код
3. Организирай мач — задай дата, място и цена
4. Играчите се записват и плащат
5. Раздели отборите, играй, запиши резултата!

GameOn — защото футболът е по-добър, когато е организиран.

### Keywords
футбол,мач,отбор,организация,спорт,плащане,резултати,класиране,група,играчи,каса,драфт,marketplace,амбициозни

### What's New
**Версия 1.0** — Първа официална версия! Организирай мачове, раздели отбори, следи статистика.

### URLs
- Privacy Policy: https://gameon.bg/privacy
- Terms of Service: https://gameon.bg/terms
- Support: https://gameon.bg/support
- Marketing: https://gameon.bg

---

## Google Play (Android)

**Package**: com.gameon.app
**Category**: Sports
**Content rating**: Everyone

### Short description (80 chars max)
Организирай футболни мачове с приятели. Отбори, плащания, статистика.

### Full description
*(Use the same long description as App Store above)*

### Feature graphic
1024×500 — see `frontend/assets/screenshots/feature_graphic.png` (TODO before submission)

### Screenshots
At least 4 phone screenshots required. Provided in `frontend/assets/screenshots/`:
- `screenshot_01.png` — Login
- `screenshot_02.png` — Профил + статистика
- `screenshot_03.png` — Match Room + RSVP
- `screenshot_04.png` — Team Draft
- `screenshot_05.png` — Класация
- `screenshot_06.png` — Каса
- `screenshot_07.png` — Discover Marketplace

### Data Safety section
| Data type | Collected | Required | Purpose |
|---|---|---|---|
| Phone number | Yes | Required | Authentication via SMS OTP |
| Name | Yes | Required | Display name in groups |
| Email | Yes | Optional | Account recovery & receipts |
| Approximate location | Yes | Optional | Discover nearby matches |
| Push tokens (Expo) | Yes | Optional | In-app notifications |
| Payment info | Processed by Stripe | Optional (PRO only) | Subscription billing |

**Data is NOT shared with third parties for advertising.**

---

## Apple Reviewer Notes

```
Test account:
  Phone: +359888999999
  OTP code: 123456 (DEV mode — accepted by the app's universal fallback)

This creates a test account with PRO trial access to all features.
The app requires a phone number for authentication via SMS OTP.

Key features to test:
1. Login with the test phone → OTP 123456 → opens main tabs
2. "Моя профил" tab → expand a group → see match cards
3. Tap a match card → opens Match Room with 5 tabs:
   - Играчи (Players) — RSVP, add/remove players, guests
   - Плащания (Payments — PRO) — mark paid, transfer to cash
   - Резултати (Results — PRO) — score + per-player goals (auto-saves)
   - Отбори (Teams — PRO) — draft system with captains
   - Чат (Chat) — real-time chat
4. "Открий" (Discover) tab — marketplace listings with filters
5. "Статистика" (Stats) tab — leaderboard with seasons + Hall of Fame
6. Settings (avatar in header) — profile edit, accent color, share group
7. /admin/login (if desired, admin@gameon.bg / admin_secure_password_2026!)

PRO features (available during 14-day TRIAL on every new group):
- Team draft with captains
- Payments (with overpaid → cash flow)
- Results with goals and MVP badge
- Group cash management
- Leaderboard + seasons + Hall of Fame
- Player marketplace search

Note on payments:
For initial App Store review the app uses an in-app browser (Stripe Checkout)
to handle PRO subscription payments. Upon successful TestFlight review and
binary approval, we will migrate to native In-App Purchase via
expo-in-app-purchases (PROMPT 12 of our roadmap) and resubmit. The
/api/billing/validate-iap-receipt endpoint already exists (currently a stub
returning valid=false) and will accept Apple receipts in the next release.
```

---

## Pre-submission checklist (excerpts from `/app/memory/DEPLOY_CHECKLIST.md`)

### Must-do before first submission:
- [ ] Replace placeholder PNGs in `assets/` (icon, splash, adaptive-icon, notification-icon, favicon)
- [ ] Replace `extra.eas.projectId` and `updates.url` in `app.json` with real EAS values
- [ ] Set `SUPER_TEST_LOGIN_ENABLED=false` in production `backend/.env`
- [ ] Set live Twilio + Stripe keys
- [ ] Create privacy.html + terms.html on https://gameon.bg
- [ ] Buy domain `gameon.bg` and set up DNS to backend host

### Strongly recommended before submission:
- [ ] Replace Stripe-in-WebView with native IAP (PROMPT 12 in roadmap)
- [ ] Localize App Store / Play Store metadata to English (current EN bundle ready in `frontend/src/i18n/en.json`)
- [ ] Run `eas build --platform ios --profile production && eas submit`
- [ ] Run `eas build --platform android --profile production && eas submit`

---

*Generated 2026-04-28 as part of PROMPT 12 — Visual polish + store submission prep.*
