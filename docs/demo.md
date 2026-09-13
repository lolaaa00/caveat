# Demo script (~90 seconds)

## Setup before you present

**Live and already deployed:** the console is at
[caveat-xi.vercel.app](https://caveat-xi.vercel.app), contract `0x0EF51C68BC0D1394b5F3880e593867ddDd0b7E31`
on chain 61997, evidence source already public. Open the live URL, connect MetaMask,
approve the switch to chain 61997, and go to `/demo` — no setup needed. All three
verdicts below have already been proven live on chain once (see the README's
"Deployment" section for the transaction links); running them again during the demo
produces a fresh, equally real instance of the same outcome.

To run against your own deployment instead:

1. `npm run deploy` — deploys to Studio Next and writes the address into `.env`.
2. Make the evidence source publicly reachable. GenLayer validators fetch it themselves,
   so `localhost` cannot work. Either deploy the app (its own `/evidence/…` pages then
   serve as the approved source automatically) or set `NEXT_PUBLIC_EVIDENCE_BASE_URL` to
   any public https origin hosting `public/evidence/amsterdam-2026-schedule.html`.
3. `npm run dev`, connect MetaMask, approve the switch to chain 61997.
4. Open `/demo` and click **Create and activate mandate** once, ahead of time.

## Opening (10s)

> CAVEAT — context-aware validation before autonomous execution.

> An agent can hold perfectly valid cryptographic authority to act long after the reason
> that authority was granted has gone stale.

## Step 1 — the mandate (10s)

Show the mandate:

> "Book the cheapest refundable flight to my conference under €900, as long as I arrive
> before the opening session."

Point out that the wording is stored verbatim, and the policy is frozen on activation.

## Step 2 — a valid proposal (15s)

Run **Scenario A**. Open the checkpoint. Show the deterministic checks:

```text
✓ Authorization   ✓ Mandate active   ✓ Mandate not expired   ✓ Policy unchanged
✓ Budget €741 ≤ €900   ✓ Destination AMS   ✓ Refundable
```

> Every fixed rule passes. A conventional permission system would execute this right now.

## Step 3 — the world moved (15s)

Show the **Current context** column: the conference opening is now **08:00**. The flight
lands at **10:30**. Both facts on one screen, the mandate beside them.

## Step 4 — the verdict (15s)

# RECONFIRM

> The agent still has permission. The action is still within budget, still refundable,
> still to the right city. But it no longer satisfies the reason the permission existed.

Show **EXECUTION LOCKED**. Try to consume the approval — the contract refuses.

## Step 5 — intent still satisfied (15s)

Run **Scenario B**: same mandate, arrival **06:45**.

# EXECUTE

Consume the approval → **one-time approval consumed**, and the contract returns the
authorization artifact. Click it again:

> Rejected on chain. Approval already consumed.

If you want to show the payment leg, note what it is and is not:

> GenLayer decided this. It does not settle it. The payment goes out on a testnet from my
> own wallet, carrying that authorization digest, and gets verified against that chain —
> the adjudication layer is not involved in moving the money.

## Step 6 — explicit prohibition (10s)

Run **Scenario C**: a non-refundable fare.

# BLOCK

> Decided by deterministic rules. No evidence fetched, no model invoked. A prohibited
> action costs nothing to reject.

## Close (10s)

> Authorization proves an agent may act. CAVEAT verifies whether acting still means what
> you meant.

---

## Fallback if the network misbehaves

Everything here is real, so anything real can fail. Options, in order of preference:

1. **A different public evidence source.** Paste any https URL into the demo's source
   field before creating the mandate.
2. **A principal-pinned fallback claim.** Set `fallback_claim` on the mandate's evidence
   question. Evidence is then recorded as `FALLBACK`, and the contract caps the verdict so
   it can never reach `EXECUTE` — Scenario A and C still work, Scenario B will show
   `RECONFIRM` with reason `EVIDENCE_FALLBACK_NO_EXECUTE`. Say so out loud if you use it.
3. **Pre-recorded artifacts.** `artifacts/e2e.studio_devnet.json` holds transaction
   hashes from real runs, and every one resolves on the Studio Next explorer.
4. **Direct tests.** `npm run test:contract` proves all three verdicts, the gate and the
   replay rejection in about 45 seconds with no network at all.

Never present a fixture as a verdict. If the network is down, say the network is down.

## Command reference

```bash
npm run test:contract      # 60 direct tests, no network
npm run lint:contract      # genvm-lint check + validate + typecheck
npm run deploy             # deploy to Studio Next (chain 61997)
python3 scripts/e2e.py     # full lifecycle on chain, writes artifacts/
npm run test:integration   # gltest against studio_devnet (~4 min, real fees)
npm run dev                # the console on http://localhost:3000
```
