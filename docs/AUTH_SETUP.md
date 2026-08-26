# AUTH_SETUP — Supabase + Google OAuth

## 1. Supabase Project
1. Create project at https://supabase.com/dashboard
2. Get `NEXT_PUBLIC_SUPABASE_URL` (Project Settings → API → Project URL)
3. Get `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon public key)
4. Get `SUPABASE_SERVICE_ROLE_KEY` (service_role, secret, never NEXT_PUBLIC)

Set in `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or https://your-prod-domain
```

## 2. Email Auth
Supabase → Authentication → Providers → Email → Enable.
- Confirm email: Enable for prod, disable for local dev if you want instant login.
- Site URL: set to `http://localhost:3000` (dev) and prod URL.
- Redirect URLs: add `http://localhost:3000/auth/callback` and `https://<prod>/auth/callback`.

## 3. Google Cloud Project
1. https://console.cloud.google.com → Create project
2. APIs & Services → OAuth consent screen → External → fill name, support email
3. Credentials → Create OAuth Client ID → Web application
   - Authorized JS origins: `http://localhost:3000`, `https://<prod>`
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback` (SUPABASE callback, not app)
4. Copy Client ID + Secret.

## 4. Supabase Google Provider
Supabase → Authentication → Providers → Google → Enable:
- Client ID (from GCP)
- Client Secret
- Redirect URL is auto: `https://<ref>.supabase.co/auth/v1/callback` — ensure it matches GCP.

## 5. Callback URL in App
App has `src/app/auth/callback/route.ts` handling `exchangeCodeForSession`.
Google flow:
```
Sign in with Google → Supabase → Google → Supabase callback → app /auth/callback?code= → exchange → session cookie → /dashboard or /results/{jobId}
```

## 6. Local Dev
```
npm run dev # http://localhost:3000
# Visit /auth/login → Continue with Google → should redirect to Google then back to app with session.
```

## 7. Production
- Set Site URL to `https://<prod>`
- Add prod callback `https://<prod>/auth/callback` to Supabase Redirect URLs.
- Ensure `NEXT_PUBLIC_APP_URL` matches prod.

## 8. Verification
- Check `supabase.auth.getUser()` in browser console after login should return user.
- Check cookies: `sb-<ref>-auth-token` exists (httpOnly via @supabase/ssr).
- Test: login → dashboard shows email → sign out → guest upload still works.

## 9. Troubleshooting
- `exchangeCodeForSession` fails → check Supabase URL/key mismatch.
- Google error `redirect_uri_mismatch` → fix GCP Authorized redirect URIs vs Supabase callback.
- No session after redirect → check `src/middleware.ts` is updating session (Next 16 middleware).

> If Google credentials not available, app falls back to email auth and guest flow; Google button will show error instead of fake success (see AuthGate).
