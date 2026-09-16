# Demo recording checklist — exact clicks

Companion to `docs/demo-video-script.md` (the narration). This is just the buttons, in
order, verified against the live app. Keep this open on a second screen while recording.

## Before you hit record

1. Open **Chrome**, go to **[caveat-xi.vercel.app](https://caveat-xi.vercel.app)**.
2. Click **Connect wallet** (top right) → approve in MetaMask → confirm it says your
   address, not "wrong network." If it says wrong network, click **Switch to chain 61997**.
3. Go to **[caveat-xi.vercel.app/demo](https://caveat-xi.vercel.app/demo)**.
4. Optional but recommended: click **Create and Activate Mandate** *now*, before recording,
   and approve both wallet prompts. This is the slowest step with the least visual payoff —
   doing it ahead of time means your recording starts already at an ACTIVE mandate. If you
   want to show mandate creation on camera instead, skip this and do it live in step 2 below.
5. Zoom your browser to ~110–125% (Cmd/Ctrl +) so text is readable in the recording.
6. Start your screen recording (QuickTime → File → New Screen Recording).

---

## The walkthrough

### 1. Homepage — the hook (~15s)

- Land on `caveat-xi.vercel.app`. Don't click anything yet — let the headline
  ("Permission can stay valid. Intent can change.") sit on screen while you say the opening.
- Click **Run The Three Scenarios** (or navigate to `/demo` directly).

### 2. The mandate (~15s)

*(Skip this if you pre-created the mandate in prep step 4.)*

- Point at the mandate text: *"Book the cheapest refundable flight to my conference under
  EUR 900, as long as I arrive before the opening session."*
- Click **Create and Activate Mandate**.
- **MetaMask popup appears** — approve it on screen. This is the transaction that writes
  the mandate on-chain.
- Wait for the banner to change from "awaiting wallet approval…" → "pending consensus…" →
  **"accepted."** This can take 10–20 seconds — keep talking, don't cut.

### 3. Scenario A — RECONFIRM (~30s)

- Point at the **Scenario A · Context Drift** card: flight arrives 10:30, conference now
  opens 08:00.
- Click **Run Checkpoint** on that card.
- **Two MetaMask popups will appear, one after another** (submit the proposal, then
  evaluate it) — approve each as it shows. Narrate this as "submitting the proposal, now
  the validators are evaluating it live."
- Wait for the verdict. This is the slowest single step — real web fetch + real LLM
  judgment + real validator consensus, typically 15–40 seconds. **This is a good moment
  to narrate the mechanism** (validators fetching the live schedule independently, judging
  against the mandate) rather than sit in silence.
- When it resolves: point at the **RECONFIRM** tag and the reason code
  (`ARRIVAL_AFTER_OPENING_SESSION` or similar).
- Click **"open checkpoint CAV-00XX →"** to go to the full checkpoint page.
- On that page, point at **"EXECUTION LOCKED"** and the **RECONFIRM_REQUIRED** status.

### 4. Reconfirm, then the execution gate (~25s)

- Click **"Reconfirm this action."**
- **MetaMask popup** — approve. Wait for "accepted." Status changes to **EXECUTE_APPROVED**.
- Point out: only the principal's wallet could do that — say so.
- Scroll down to the **"Consume Approval"** button. Click it.
- **MetaMask popup** — approve. Wait for "accepted." Status changes to **APPROVAL_CONSUMED**.
- Point at the **Decision Receipt** — this is the on-chain proof, not a UI claim.

### 5. Optional: show replay rejection (~10s)

- If you want to demonstrate the one-time gate live: try clicking **Consume Approval**
  again (it should no longer be visible/clickable once consumed — say so out loud: *"the
  button's gone because the contract already marked this spent — there's nothing left to
  click."* If you'd rather show the actual on-chain rejection message, you can skip this
  and instead cut to the pre-verified evidence below.

### 6. Scenario B — EXECUTE (~20s)

- Go back to `/demo`.
- Click **Run Checkpoint** on **Scenario B · Intent Still Satisfied** (arrives 06:45, same
  mandate).
- Approve the wallet prompts. Wait for the verdict.
- Point at **EXECUTE** — contrast with Scenario A: same live evidence, earlier arrival,
  intent still holds, no reconfirmation needed.

### 7. Scenario C — BLOCK (~10s, fast)

- Click **Run Checkpoint** on **Scenario C · Explicit Prohibition** (non-refundable fare).
- This one resolves almost instantly — no evidence fetch, no model call, pure deterministic
  rejection. Say so: *"notice how fast that was — the model was never even invoked."*
- Point at **BLOCK**.

### 8. Wallet-free proof, for context (~10s, optional)

- Scroll up on `/demo` to the **"Proven live results · no wallet needed"** panel.
- Mention: *"and here's the same three outcomes from an earlier verified run, each linking
  to its own transaction — so none of this depends on trusting what you just watched me
  click."*
- Click one **"view tx →"** link to briefly show the GenLayer explorer.

### 9. Close (~10s)

- Return to the homepage or the three-scenario view.
- End on your closing line. Stop recording — don't add "thanks for watching."

---

## If something stalls

- **A wallet prompt seems stuck / nothing happens after clicking**: check for a MetaMask
  popup that needs your click — it doesn't always grab focus automatically.
- **A verdict is taking a long time**: this is a shared testnet; validators, LLM calls, and
  consensus are all real and can genuinely take up to ~40s. Don't panic-cut — narrate
  through it.
- **Something visibly errors**: don't edit around it silently. Either say what's happening
  ("Studio Next is a shared preview network, this is retrying") or cut to the **Proven live
  results** panel / `artifacts/e2e.studio_devnet.json` and narrate over real, already-verified
  transaction hashes instead. Never present a fixture as if it were a live decision.
