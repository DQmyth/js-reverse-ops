# Anti-Detection Profile Selection

Use an anti-detection profile only after recording the hostile signal or runtime symptom.

## Selection Rule

Start from `baseline-observe`. Escalate only when evidence shows the current observation surface is changing target behavior.

Use `scripts/select_anti_detection_profile.js` with short symptom notes:

```bash
node scripts/select_anti_detection_profile.js --symptoms "debugger loop; bootstrap request disappears after reload"
```

## Profiles

- `baseline-observe`: default network-first observation with minimal hooks.
- `preload-survival`: use when bootstrap logic is one-shot, disappears after first load, or must be captured before page scripts run.
- `stealth-runtime`: use when hook tamper checks, `toString` integrity checks, broad monkeypatch detection, or UI misdirection appears.

## Evidence Boundary

Anti-detection success is not signer correctness.

Record profile selection as:

- hostile signal observed
- symptom
- selected profile
- patch classes
- post-profile observation result
- whether the protected request became visible

Do not promote to `runtime-accepted` or `delivery-ready` from profile selection alone. Promotion still requires runtime evidence plus accepted replay, server acceptance, or challenge-success evidence.
