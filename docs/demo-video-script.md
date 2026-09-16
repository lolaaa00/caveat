# CAVEAT — demo video script (~100s)

Read this aloud while screen-recording (QuickTime → File → New Screen Recording, free,
built into macOS). Everything on screen is real: real wallet, real GenLayer validators,
real transactions on Studio Next (chain 61997). Nothing here is simulated.

**Before you hit record:**
- Open [caveat-xi.vercel.app](https://caveat-xi.vercel.app) in Chrome, MetaMask installed.
- Connect your wallet and switch to chain 61997 *before* recording, so that part doesn't
  eat into your runtime — or leave it in if you want to show the connect flow (adds ~10s).
- Have the `/demo` page open.
- Zoom your browser to ~110–125% so text reads clearly on a recording.

---

## 0:00–0:12 — The problem

*(On screen: the homepage headline, "Permission can stay valid. Intent can change.")*

> An AI agent can hold perfectly valid cryptographic permission to act, long after the
> reason that permission was granted has gone stale. You told it: book the cheapest
> refundable flight under 900 euros, as long as I arrive before the conference opens.
> It finds one. Budget's fine. Refundable, fine. Signature's valid. Then the conference
> moves its opening session earlier — and a normal permission system just... executes
> anyway, because nothing about its *authority* changed.

## 0:12–0:20 — What CAVEAT is

*(On screen: navigate to /demo)*

> CAVEAT is a checkpoint between authority and execution, built as a GenLayer Intelligent
> Contract. Before an agent's action goes through, GenLayer's validators independently
> check: does this still faithfully serve what the principal actually meant?

## 0:20–0:35 — Create a real mandate

*(Click "Create and Activate Mandate." Approve in MetaMask on screen.)*

> This is a real transaction, signed by my wallet, submitted to chain 61997. The mandate
> — the flight-booking instruction, in plain English — gets written on-chain and its
> evidence policy is frozen the moment it activates. No one can change what counts as
> valid proof after the fact.

*(Wait for "accepted." Point at the mandate ID / ACTIVE status.)*

## 0:35–0:55 — Submit a proposal, watch it evaluate live

*(Click "Run Checkpoint" on Scenario A. Approve the wallet prompt(s).)*

> Now I propose an actual flight: arrives 10:30, refundable, under budget. Every fixed
> rule passes. GenLayer's validators fetch the conference schedule themselves — live,
> from a public page I don't control at this moment — and an LLM judges whether this
> booking still serves the reason the mandate exists. Independent validators have to
> *agree* on that judgment before it counts.

*(Wait for the verdict to render.)*

## 0:55–1:10 — The verdict: RECONFIRM

*(Point at the RECONFIRM tag and reason code on screen.)*

> RECONFIRM. The agent still has permission. The booking is still within every rule. But
> the conference start moved to 8am — this flight would now land after it opens. That's
> not a rule violation, it's the *reason* for the trip disappearing. Execution stays
> locked until I, the principal, personally reconfirm.

*(Open the checkpoint page. Show "EXECUTION LOCKED.")*

## 1:10–1:30 — Reconfirm, then the one-time execution gate

*(Click "Reconfirm this action." Approve in MetaMask.)*

> I reconfirm — a real signed transaction, only I can do this.

*(Wait for EXECUTE_APPROVED. Click "Consume Approval." Approve in MetaMask.)*

> Now execution unlocks — once. The contract returns a single-use authorization artifact
> binding this exact decision. If I try to consume it again —

*(If time allows: show or mention the replay rejection — "approval already consumed,"
 enforced by the contract itself, not the UI.)*

> — the contract refuses. Not the frontend. The contract.

## 1:30–1:40 — Why this needs decentralized judgment

> This isn't a task an if-statement can do. "Does this still serve the original intent"
> is a semantic question, over evidence that lives off-chain, decided by a model, under
> multiple independent validators who have to agree. That combination — natural language,
> live external evidence, non-deterministic judgment, real consensus — only exists on
> GenLayer.

## 1:40–1:45 — Close

> Authorization proves an agent *may* act. CAVEAT verifies whether acting still means
> what you meant. Live on Studio Next, right now — link in the description.

---

## If you have 20 extra seconds

Run Scenario C (non-refundable fare) to show **BLOCK** — no evidence fetched, no model
invoked, a prohibited action costs nothing to reject. Say: "explicit rules never touch
the model — only genuine ambiguity does."

## If something on the live network misbehaves mid-recording

Don't panic-cut. Say what's happening ("Studio Next is a shared preview network, this
call is retrying") — that's honest, not a flaw. If a call is truly stuck, cut to
`artifacts/e2e.studio_devnet.json` on screen and read out a couple of the real
transaction hashes from the last verified run instead. Never narrate a fixture as if it
were a live decision.
