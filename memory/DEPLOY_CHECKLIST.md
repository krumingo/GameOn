# GameOn Deployment Checklist

## Pre-deploy (backend)
- [ ] MongoDB Atlas cluster created (EU region)
- [ ] `backend/.env` populated from `backend/.env.example` with REAL values
- [ ] `JWT_SECRET` is a fresh random 256-bit string (`openssl rand -hex 32`)
- [ ] `ADMIN_PASSWORD` is strong and unique
- [ ] `SUPER_TEST_LOGIN_ENABLED=false` in production
- [ ] Twilio account verified, phone number purchased, `TWILIO_*` keys set
- [ ] Stripe LIVE key + price_id + webhook secret configured
- [ ] Stripe webhook URL in dashboard points to `https://api.gameon.bg/api/stripe/webhook`
- [ ] CORS `allow_origins` narrowed from `*` to known domains in `server.py`

## Backend deploy
- [ ] Deploy to Railway / Render / Fly.io (or VPS with systemd)
- [ ] SSL certificate active (TLS 1.3)
- [ ] `GET /api/health` returns `{"status":"ok"}` over HTTPS
- [ ] Recurrence + Reminder cron tasks running (check logs for `Reminder cron: sent N pushes`)

## Frontend deploy
- [ ] `app.json` `extra.eas.projectId` filled with real EAS project id
- [ ] `app.json` `updates.url` updated to `https://u.expo.dev/<projectId>`
- [ ] Final assets in `assets/` (replace placeholders): icon.png, splash.png, adaptive-icon.png, notification-icon.png, favicon.png
- [ ] `eas.json` production env `EXPO_PUBLIC_API_URL` points to production backend
- [ ] `eas build --platform ios --profile production`
- [ ] `eas build --platform android --profile production`

## App Store (iOS)
- [ ] Apple Developer account active (\$99/yr)
- [ ] App Store Connect: app record created with bundle id `com.gameon.app`
- [ ] 7 screenshots (6.5" iPhone) — Dark Glass screens
- [ ] Description, keywords, primary category: Sports
- [ ] Privacy Policy URL: `https://gameon.bg/privacy`
- [ ] Terms URL: `https://gameon.bg/terms`
- [ ] Test account for Apple review:  +359888999999 / OTP 123456 (only valid while `SUPER_TEST_LOGIN_ENABLED=true` — leave true on staging, false on prod)
- [ ] `eas submit --platform ios --profile production`

## Google Play (Android)
- [ ] Google Play Developer account (\$25 once)
- [ ] Play Console: app record with package `com.gameon.app`
- [ ] Data safety section completed (push token + phone collected)
- [ ] Feature graphic 1024x500
- [ ] Internal testing track → closed testing → production
- [ ] `eas submit --platform android --profile production`

## Post-deploy verification
- [ ] OTP login on real iOS device
- [ ] OTP login on real Android device
- [ ] Push notification received on real device after creating a match
- [ ] Reminder push delivered when within `reminder_hours` window
- [ ] Stripe checkout works via in-app browser → webhook activates PRO
- [ ] Admin panel reachable at `https://gameon.bg/admin/login`

## Future migrations
- [ ] Switch from Stripe-in-WebView to native IAP (App Store rejects digital goods bypassing IAP)
  - Use `expo-in-app-purchases` or `react-native-iap`
  - Implement `POST /api/billing/validate-iap-receipt` server validation
- [ ] Migrate web hosting to Vercel/Cloudflare with `EXPO_PUBLIC_API_URL` env override
