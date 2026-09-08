# CAVEAT

**A context-aware execution checkpoint for autonomous agents.**

> Authorization proves that an agent *may* act.
> CAVEAT verifies whether acting *still faithfully represents the principal's intent*.

Built on GenLayer. Deployed to Studio Next (chain 61997).

---

## The problem

An agent can hold valid cryptographic authority to act long after the reason for granting
that authority has become stale.

You tell an agent: *"Book the cheapest refundable flight to my conference under €900, as
long as I arrive before the opening session."* It finds a €741 refundable flight arriving
10:30. Budget: fine. Destination: fine. Refundable: fine. Signature: valid.

Then the conference moves its opening session to 08:00.

Nothing about the agent's permission changed. Every deterministic rule still passes. A
conventional permission system executes the booking — and gets the principal to Amsterdam
two and a half hours after the thing they were flying there for began.

That gap between *permitted* and *still faithful to the intent* is what CAVEAT closes.

## The solution

A checkpoint between authority and execution:

```text
Original Mandate  +  Proposed Action  +  Current Independently Fetched Evidence
                            + GenLayer Consensus
                                    =
                       EXECUTE  /  RECONFIRM  /  BLOCK
```

- **EXECUTE** — every purpose-critical condition still holds. Unlocks a *single-use*
  execution approval.
- **RECONFIRM** — formally permitted, but a purpose-critical condition no longer holds, or
  the evidence is ambiguous. Execution stays locked until the principal personally
  re-authorizes.
- **BLOCK** — the action contradicts the mandate. No execution path exists.

`INCONCLUSIVE` exists internally and surfaces as `RECONFIRM`, so an unverifiable world can
never look like an approval.

## Why GenLayer

The checkpoint needs four properties at once, and no ordinary chain has any of them:

| Requirement | Why it matters here |
| --- | --- |
| **Natural-language intent** | The mandate is the principal's own words. Whether an action still serves their purpose is a semantic question, not an arithmetic one |
| **External web evidence** | The fact that invalidates a mandate lives off-chain. GenLayer validators fetch it themselves, so the *proposing agent never gets to say what the evidence is* |
| **Non-deterministic judgement** | The residue deterministic code cannot decide is exactly where a model belongs — under a narrow, structured prompt |
| **Validator consensus** | One model answer is an opinion. Consensus under an equivalence principle is what makes a verdict usable as an authorization gate |

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full diagram.

```text
PRINCIPAL → mandate → CAVEAT Intelligent Contract
                          ├── deterministic pre-checks   (fail → BLOCK, no model call)
                          ├── evidence policy            (principal-set, frozen)
                          └── GenLayer: web + LLM + consensus
                                    ↓
                     EXECUTE / RECONFIRM / BLOCK  →  decision receipt
                                    ↓
                        one-time execution gate  →  verified testnet settlement
```

**The Intelligent Contract is the only authority for verdicts.** The frontend computes
none of them; it reads state and submits signed transactions.

## Deployment

| | |
| --- | --- |
| Network | GenLayer Studio Next / Studio-dev |
| Chain ID | **61997** |
| Contract | [`0x30fDfBD74eD29b32fD4E413210415048633eCC22`](https://explorer-studio-dev.genlayer.com/address/0x30fDfBD74eD29b32fD4E413210415048633eCC22) |
| Deployment tx | [`0x871a7f4c…cd62a58`](https://explorer-studio-dev.genlayer.com/tx/0x871a7f4cb642805b6e65f29afb65a315cdd83345a6ac2b9e33c2a32dccd62a58) |
| Consensus / execution | `MAJORITY_AGREE` / `SUCCESS` |
| Evidence | `artifacts/deployment.studio_devnet.json`, `artifacts/e2e.studio_devnet.json` |

Studio Next is a resettable preview network. If the deployment has been reset, redeploy
with `npm run deploy` — it takes about a minute and writes fresh evidence artifacts.

> Studio Next (61997) is **not** StudioNet (61999). They are different deployments with
> different chain IDs, and evidence from one is not evidence for the other.

## Setup

Requirements: Node 20+, **Python 3.11 or newer** (3.12 recommended), a browser wallet.

The RC Python stack publishes no wheels for Python 3.9, which is still the default
`python3` on macOS — so name the interpreter explicitly rather than relying on `python3`.

```bash
git clone <this repo> && cd caveat
npm install

# use a 3.11+ interpreter; on macOS with Homebrew:
/usr/local/opt/python@3.12/bin/python3.12 -m venv .venv    # or python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

npm install -g genlayer@0.40.0-rc.3
cp .env.example .env
```

Check it took: `.venv/bin/python -V` should print 3.11 or newer.

Everything below works with no keys and no accounts. Testnet keys are generated
automatically on first deploy and written to `.env` (gitignored).

```bash
npm run test:contract   # 68 direct tests, no network, ~45s (uses .venv)
npm run lint:contract   # genvm-lint check + validate + typecheck
npm run deploy          # deploy to Studio Next, write .env + artifacts
npm run dev             # console on http://localhost:3000
```

## Testing

```bash
npm run test:contract      # 68 in-process tests against the real SDK
npm run test:integration   # 5 tests on chain 61997 (~4 min, real validators and fees)
python3 scripts/e2e.py     # full lifecycle on chain, writes artifacts/
npm run typecheck          # frontend types
npm run build              # production build
```

| Suite | Covers |
| --- | --- |
| `test/direct/test_mandate.py` | Lifecycle, permissions, expiry, evidence-policy validation |
| `test/direct/test_deterministic_checks.py` | Budget, destination, refundability, missing fields, wrong agent, stale mandate, re-evaluation |
| `test/direct/test_semantic.py` | All three verdicts, `INCONCLUSIVE`, fail-closed, fallback capping, evidence digests |
| `test/direct/test_execution_gate.py` | Gate, reconfirmation, rejection, replay, revocation, expiry |
| `test/direct/test_security.py` | Prompt-injection fencing, truncation, agent-crafted evidence, policy mutation |
| `test/direct/test_settlement.py` | Both rails, verification refusals, ordering, replay |
| `test/integration/test_studio_next.py` | The same behaviour on the real network |

## Environment variables

Nothing here is required for the direct tests. See `.env.example`.

| Variable | Required for | Notes |
| --- | --- | --- |
| `CAVEAT_PRINCIPAL_PRIVATE_KEY` | deploy, e2e | Testnet only. Generated automatically if absent |
| `CAVEAT_AGENT_PRIVATE_KEY` | e2e | Testnet only. Generated automatically if absent |
| `NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS` | frontend | Written by `npm run deploy` |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | — | Defaults to `https://studio-dev.genlayer.com/api` |
| `NEXT_PUBLIC_GENLAYER_CHAIN_ID` | — | Defaults to `61997` |
| `NEXT_PUBLIC_GENLAYER_EXPLORER_URL` | — | Defaults to the Studio Dev explorer |
| `NEXT_PUBLIC_EVIDENCE_BASE_URL` | live demo | Public https origin serving `public/evidence/…`. Defaults to the app's own origin |
| `EVIDENCE_BASE_URL` | `scripts/e2e.py` | Same, for the CLI lifecycle run |

No secrets are committed. No private key is ever written to source. The browser never
generates a key — signing happens in the wallet.

## Decision model

| Verdict | Meaning | Execution |
| --- | --- | --- |
| `EXECUTE` | Purpose-critical conditions still hold | One-time approval opens |
| `RECONFIRM` | Permitted, but no longer faithful — or unverifiable | Locked pending fresh principal authority |
| `BLOCK` | Contradicts the mandate | No path |
| `INCONCLUSIVE` *(internal)* | Evidence or judgement unusable | Surfaces as `RECONFIRM` |

Deterministic checks run **before** any model call. A hard-constraint failure is `BLOCK`
at zero LLM cost — see `test_budget_failure_blocks_without_a_model_call`.

## Evidence model

Evidence is bounded by policy the principal sets and the contract freezes on activation:

- `approved_sources` — https only; an evidence question pointing anywhere else is rejected at creation.
- Each evidence record carries its **claim**, **source URL**, **retrieval class** (`LIVE` / `FALLBACK` / `UNAVAILABLE`), **retrieval time**, and contributes to an **evidence digest** bound into the receipt.
- Page content is truncated and fenced as untrusted data. The judgement step never sees raw page content — only the extracted claim.
- The proposing agent cannot supply, choose, or influence verdict-producing evidence.

## Security

Full analysis in [docs/threat-model.md](docs/threat-model.md). Headlines:

- **Stale authority** → the entire point; `RECONFIRM` with execution locked.
- **Agent-supplied evidence** → impossible by construction; policy is principal-set and frozen.
- **Prompt injection** → page content bounded, fenced, and declared untrusted; extraction may only return a stated value or `NOT_FOUND`.
- **Replay** → one-time approval, second attempt reverts on chain.
- **Policy mutation** → proposals bind the policy commitment; a mismatch blocks.
- **Source outage** → fail closed; unavailable evidence can never yield `EXECUTE`.
- **Money before verdict** → settlement requires a consumed approval, and is verified before being recorded.

## Payment rail

The settlement leg of the gate, not a payments product. Sepolia and Solana devnet only.

The principal pays from their own wallet; CAVEAT never holds funds or keys. The contract
then verifies the transaction against a free keyless public RPC — success status, the
stated payee, an amount at least what was claimed — and records it only if it verifies.
Ordering is enforced on chain: settlement is refused unless the proposal reached
`EXECUTE_APPROVED` and its one-time approval was consumed.

## Demo

Three outcomes from one mandate. Script in [docs/demo.md](docs/demo.md); run it from
`/demo` in the console.

| Scenario | Setup | Exercises |
| --- | --- | --- |
| **A — context drift** | €741, refundable, arrives 10:30; opening moved to 08:00 | All fixed rules pass, so the semantic checkpoint must catch it |
| **B — intent satisfied** | Same mandate, arrives 06:45 | Clears the checkpoint, opens a single-use approval |
| **C — explicit prohibition** | Non-refundable fare | Deterministic rules decide; no model, no evidence fetch |

**Fixtures supply inputs only** — the mandate wording, the proposed action, and which
approved source to read. They never supply a verdict, a consensus result, a transaction
status or contract state. Every outcome shown is read back from the contract.

## Zero cost

No paid API keys, no billing, no card, no paid RPC, database, hosting or monitoring.
GenLayer validator web access covers evidence; keyless public RPCs cover settlement
verification; Sepolia and Solana devnet funds come from free faucets; Studio Next has a
built-in faucet the deploy script calls automatically.

## Roadmap

The contract knows nothing about flights. It stores an `action_type`, an opaque
`action_payload`, and hard constraints as `{field, op, value}` paths into that payload —
so new verticals are new adapters, not new contracts.

| Next | Shape |
| --- | --- |
| Procurement | Supplier status and delivery-window evidence over the same constraint engine |
| SaaS renewal | Seat counts and price-change evidence before auto-renewal executes |
| Marketplace purchase | Stock, dispatch and seller-standing evidence |
| Treasury action | Counterparty and rate evidence ahead of a transfer |
| Cross-chain execution | The gate stays on GenLayer; settlement verification extends per chain |
| Agent SDK | `is_executable` / `consume_approval` as a two-call integration for any agent framework |

## Repository

```text
contracts/caveat.py            the Intelligent Contract — all state, all verdicts
app/                           console: dashboard, mandates, checkpoint, receipt, demo
components/                    ui, mandate, proposal, decision, execution
lib/                           config, types, genlayer client, wallet, fixtures
scripts/deploy.py              deploy to Studio Next + write evidence artifacts
scripts/e2e.py                 full lifecycle on chain
test/direct/                   68 in-process tests
test/integration/              5 tests on chain 61997
public/evidence/               first-party evidence pages for the demo
docs/                          architecture, threat model, demo script
BUILD_DECISIONS.md             locked stack and architectural non-negotiables
```

---

**The agent had permission. The world changed. CAVEAT caught it before execution.**
