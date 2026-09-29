# SSOT Wix-native EN patches

## Already on main
- `internalConfig.js` — BOOKING_STATUS / PAYMENT_STATUS / PAYMENT_METHOD = Wix EN (commit f95c8ef)
- `citasManager.web.js` — PAYMENT_STATUS.PAID / BOOKING_STATUS.CONFIRMED (commit 29e1e32)

## Apply core + saga
```bash
cd marianmadridV
git apply patches/ssot-wix-native-core.patch
git apply patches/ssot-wix-native-saga.patch
git add src/backend/booking/
git commit -m "fix(booking): apply Wix-native EN SSOT patches"
git push
```

Or copy full modules from `ssot_align.zip` artifacts.
