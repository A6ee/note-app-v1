# P1 Go-Live Checklist (Checkable)

## CSP and Security Headers
- [ ] Deploy [vercel.json](vercel.json) to production.
- [ ] Confirm `Content-Security-Policy` is present on document response.
- [ ] Confirm `frame-ancestors 'none'` is active.
- [ ] Confirm `script-src` allows only `self`, `cdn.tailwindcss.com`, and `cdnjs.cloudflare.com`.
- [ ] Confirm `connect-src` includes Firebase and required Google APIs only.
- [ ] Confirm `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` are present.
- [ ] Confirm `Strict-Transport-Security` is present on HTTPS responses.
- [ ] Open app pages and verify no CSP violations cause blank screen.

## External CDN Alignment (No White Screen)
- [ ] Confirm [public/tailwind-config.js](public/tailwind-config.js) loads successfully (HTTP 200).
- [ ] Confirm Tailwind CDN script still loads successfully.
- [ ] Confirm Font Awesome stylesheet and html2pdf bundle load successfully.
- [ ] Open browser DevTools Console and ensure there are no CSP `Refused to load` errors.

## Firestore Rules Hardening
- [ ] Publish [firestore.rules](firestore.rules) to Firestore.
- [ ] Verify non-owner read/write is denied.
- [ ] Verify extra unexpected keys are denied.
- [ ] Verify invalid type payloads are denied.
- [ ] Verify oversize field payloads are denied.
- [ ] Verify allowed owner payloads still pass create/update.

## API Input Controls
- [ ] Confirm `/api/gemini` rejects non-JSON requests with 415.
- [ ] Confirm invalid payload types return 400.
- [ ] Confirm unsupported `aiStyle` returns 400.
- [ ] Confirm response contains `Cache-Control: no-store`.

# P2 Platform Rate Limit + Bot/WAF Plan

## Implemented in this repo now
- Persistent rate limiting in [api/gemini.js](api/gemini.js) via Upstash Redis REST.
- In-memory limiter remains as fallback only if Redis is unavailable.
- Bot-like user-agent blocking in [api/gemini.js](api/gemini.js).
- Optional security alert webhook in [api/gemini.js](api/gemini.js).

## Required environment variables
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SECURITY_ALERT_WEBHOOK_URL` (optional but recommended)

## Recommended platform controls (Vercel Dashboard)
- [ ] Enable Vercel WAF managed rules.
- [ ] Add bot protection/challenge policy for `/api/*`.
- [ ] Add geo/ip-based deny rules if abuse sources are known.
- [ ] Add request spike alerting and cost anomaly alerts.
- [ ] Add log retention and weekly abuse review.

## Validation steps for P2
- [ ] Send 35 POST requests within 60 seconds from one IP and verify 429 appears.
- [ ] Verify `Retry-After` header is returned on 429.
- [ ] Verify hard block threshold triggers alert webhook.
- [ ] Simulate Redis outage and confirm API still serves via fallback limiter.
- [ ] Verify normal users still succeed under expected traffic.
