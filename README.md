# CAVEAT

**A context-aware execution checkpoint for autonomous agents.**

> Authorization proves that an agent *may* act.
> CAVEAT verifies whether acting *still faithfully represents the principal's intent*.

Built on GenLayer. Deployed to Studio Next (chain 61997).

## Track: Onchain Justice

CAVEAT applies evidence-based rule enforcement before an autonomous agent acts. Unlike
conventional disputes adjudicated after harm occurs, CAVEAT evaluates a proposed action
against the principal's mandate, current independently retrieved evidence, and semantic
intent, then returns an enforceable `EXECUTE`, `RECONFIRM`, or `BLOCK` verdict.

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

## Try CAVEAT

**Live app:** [caveat-xi.vercel.app](https://caveat-xi.vercel.app)
**Network:** GenLayer Studio Next · Chain 61997
**Contract:** [`0x0B063A6Fb5aFA78bc8C1F9C77abf73cb5Ff7Dd14`](https://explorer-studio-dev.genlayer.com/address/0x0B063A6Fb5aFA78bc8C1F9C77abf73cb5Ff7Dd14)

Connect a wallet, switch to chain 61997, and open `/demo` to run one mandate through
three outcomes:

- **RECONFIRM** — the agent still has permission, but current context breaks the
  mandate's purpose.
- **EXECUTE** — current context still satisfies the mandate.
- **BLOCK** — an explicit deterministic constraint is violated.

Every verdict shown is read back from the deployed Intelligent Contract. The frontend
never computes one — see [Deployment](#deployment) below for the transaction proof.

## Demo video

▶️ [Watch the CAVEAT demo](https://x.com/Lolaaa_00_/status/2100574626615009493)

The video demonstrates `RECONFIRM`, `EXECUTE`, and `BLOCK` through real transactions on
GenLayer Studio Next, chain `61997`.

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
| Live console | **[caveat-xi.vercel.app](https://caveat-xi.vercel.app)** |
| Repository | **[github.com/lolaaa00/caveat](https://github.com/lolaaa00/caveat)** |
| Network | GenLayer Studio Next |
| RPC | `https://studio-next.genlayer.com/api` |
| Chain ID | **61997** |
| Contract | [`0x0B063A6Fb5aFA78bc8C1F9C77abf73cb5Ff7Dd14`](https://explorer-studio-dev.genlayer.com/address/0x0B063A6Fb5aFA78bc8C1F9C77abf73cb5Ff7Dd14) |
| Deployment tx | [`0x587c5e73…8a1302`](https://explorer-studio-dev.genlayer.com/tx/0x587c5e7378646630e7c41d4f470b2ecdd42c058f48caa760f9b1e660b58a1302) |
| Consensus / execution | `MAJORITY_AGREE` / `SUCCESS` |
| Source commit | `3ae7a11` (this repo, `main`) |
| Runtime | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` (pinned, verified against this exact deployment) |
| Deployed via | `genlayer` CLI `0.40.0-rc.3` (native `genlayer deploy`), local devDependency — not global |
| Schema parity | **matches** local source at the commit above — checked live via `get_contract_schema`/`get_contract_schema_for_code`, recorded in the manifest |
| Evidence | `artifacts/deployment.studio_devnet.json`, `artifacts/e2e.studio_devnet.json` |

Studio Next is a resettable preview network. If the deployment has been reset, redeploy
with `npm run deploy` — it takes about a minute and writes fresh evidence artifacts.

### All three verdicts, proven live

Every outcome below ran against the current deployed contract (`0x0B063A6F…`) on chain
61997 — real validators, real web retrieval, real LLM judgement under consensus, real
transactions. One mandate (`MND-0012`), three proposals, three verdicts.
Full record in `artifacts/e2e.studio_devnet.json`.

| Scenario | Proposal | Verdict | What happened on chain |
| --- | --- | --- | --- |
| A — context drift | [`CAV-0014`](https://explorer-studio-dev.genlayer.com/tx/0xc2f522fbda84b719ecfc8e685b3c6f1aa57da91601bfc4b4dfc16cd16509d93f) | **RECONFIRM** | Validators fetched the live schedule (`08:00`), judged the 10:30 arrival against the mandate, locked execution — then the principal [reconfirmed](https://explorer-studio-dev.genlayer.com/tx/0xd6e28065f985bd6e0011e888905f0f3a6df085d4d7c2c1b2be0b3d648aa5b2ff) and execution unlocked |
| B — intent satisfied | [`CAV-0015`](https://explorer-studio-dev.genlayer.com/tx/0x37ac4e365ccb88f85d2c84bd7fddd067d691a0d02e484b97fef67f2b5c3ec92e) | **EXECUTE** | Same live evidence, 06:45 arrival — checkpoint cleared, approval opened, then [consumed](https://explorer-studio-dev.genlayer.com/tx/0x6881a7125272f873bc2902cbb40207038d8645f00bd0f75b8d6c74a29930376c) exactly once |
| C — explicit prohibition | [`CAV-0018`](https://explorer-studio-dev.genlayer.com/tx/0xb3c83c9c66b814138273cd8e6118c84c86a400e8c2fd706d34080378e7e1f55b) | **BLOCK** | Non-refundable fare — decided by a deterministic pre-check, no evidence fetched, no model invoked |

Also proven on chain (`test/integration/`): deployment, mandate lifecycle, the one-time
execution gate, and a rejected replay. The stale-approval-invalidation property (a second
proposal's reconfirmation staling a first, already-approved one) is proven deterministically
by `test/direct/test_stale_approval.py` (7/7 passing, including the exact headline scenario)
— live re-runs of that specific interaction are inherently non-deterministic, since it only
fires when the model judges a *second* proposal to also need reconfirmation.

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

cp .env.example .env
```

`npm install` already pulled in `genlayer@0.40.0-rc.3` as a local devDependency (see
`BUILD_DECISIONS.md`) — no global install needed. Run it via `npx genlayer ...` if you
want the CLI directly; nothing in the commands below requires it.

Check it took: `.venv/bin/python -V` should print 3.11 or newer.

Everything below works with no keys and no accounts. Testnet keys are generated
automatically on first deploy and written to `.env` (gitignored).

```bash
npm run test:contract   # 130 direct tests, no network, ~2 min (uses .venv)
npm run lint:contract   # genvm-lint check + validate + typecheck
npm run deploy          # deploy to Studio Next, write .env + artifacts
npm run dev             # console on http://localhost:3000
```

## Testing

```bash
npm run test:contract           # 130 in-process tests against the real SDK
npm run test:integration        # integration tests on chain 61997 (~4 min, real validators)
.venv/bin/python scripts/e2e.py # full lifecycle on chain, writes artifacts/
npm run typecheck               # frontend types
npm run build                   # production build
```

`scripts/e2e.py` must run under `.venv/bin/python`, not the bare `python3` on macOS — see
Setup above for why.

| Suite | Tests | Covers |
| --- | --- | --- |
| `test/direct/test_mandate.py` | 15 | Lifecycle, permissions, expiry, evidence-policy validation, self-mandate (`agent == principal`) documented as allowed |
| `test/direct/test_deterministic_checks.py` | 13 | Budget, destination, refundability, missing fields, wrong agent, stale mandate, re-evaluation |
| `test/direct/test_semantic.py` | 8 | All three verdicts, `INCONCLUSIVE`, fail-closed, fallback capping, evidence digests |
| `test/direct/test_execution_gate.py` | 19 | Gate, reconfirmation, rejection, replay, revocation, expiry, **gate-parity** (is_executable / get_proposal.executable / consume_approval share one predicate — proven by literal delegation, not just agreement) |
| `test/direct/test_stale_approval.py` | 7 | Stale-approval bypass prevention, all staleness paths |
| `test/direct/test_security.py` | 8 | Prompt-injection fencing, truncation, agent-crafted evidence, policy mutation |
| `test/direct/test_evidence_integrity.py` | 10 | Excerpt verification, content digests, consensus-failure fail-closed, answer-schema conformance documented as a known limitation |
| `test/direct/test_hostile_input.py` | 6 | Prompt injection in payload, action summary, and via evidence source |
| `test/direct/test_input_bounds.py` | 38 | Field length caps, decimal precision, canonical digests, **URL safety** (private IPs, credentials, fragments, non-https), sources/questions consistency, no-evidence (pure-constraint) mandates reaching a verdict |
| `test/direct/test_authorization_artifact.py` | 6 | Authorization artifact correctness and binding |
| `test/integration/test_studio_next.py` | 5 | Same behaviour on chain 61997 |

## Environment variables

Nothing here is required for the direct tests. See `.env.example`.

| Variable | Required for | Notes |
| --- | --- | --- |
| `CAVEAT_PRINCIPAL_PRIVATE_KEY` | deploy, e2e | Testnet only. Generated automatically if absent |
| `CAVEAT_AGENT_PRIVATE_KEY` | e2e | Testnet only. Generated automatically if absent |
| `NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS` | frontend | Written by `npm run deploy` |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | — | Defaults to `https://studio-next.genlayer.com/api` |
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

- `approved_sources` — absolute HTTPS only, public hosts only (private IPs, localhost, and credentials are rejected at creation); non-empty if and only if `evidence_questions` is also non-empty.
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
- **Private-network fetch** → approved source URLs are validated at creation: only absolute HTTPS URLs with public hosts are accepted; private/loopback/reserved IPs, credentials, and fragments are rejected on-chain.
- **Execution-gate divergence** → `is_executable()`, `get_proposal().executable`, and `consume_approval()` all derive their answer from a single shared predicate (`_executable_gate`), so they cannot disagree about mandate status, expiry, staleness, or consumed state.
- **Money before verdict** → payment has nothing to reference until an approval is consumed; the contract itself never settles.

## Where CAVEAT stops

**GenLayer is the decision and adjudication layer. It does not move value, hold value, or
verify payments.** The contract's entire output is a verdict and, for `EXECUTE`, a
single-use authorization artifact. There is no `settle`, `pay`, `transfer` or
`verify_payment` on it, and a test enforces that.

`consume_approval` returns a digest binding the proposal, the exact mandate policy it was
judged against, the evidence behind the verdict, and the moment of consumption. That
digest is the boundary: whatever executes the action downstream carries it as proof the
action was authorized by a specific decision.

## Payment rail (behind the gate)

Sepolia and Solana devnet, testnet only. Deliberately *outside* the contract:

- The principal pays from their own wallet. CAVEAT never holds funds or keys.
- On Sepolia the payment carries the authorization artifact in its calldata, so the
  payment itself references the decision that permitted it — checkable by anyone, with the
  adjudication layer not involved in the payment at all.
- The payment is verified client-side against the settling chain's own free keyless public
  RPC (success status, stated payee, sufficient amount). An unverifiable hash is never
  shown as settled.
- The record is browser-local and non-authoritative, and is re-verified against the chain
  rather than trusted. Losing it loses a convenience, never a decision.
- Ordering holds because the gate holds: without a consumed approval there is no
  authorization artifact to pay against.

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
verification client-side; Sepolia and Solana devnet funds come from free faucets; Studio Next has a
built-in faucet the deploy script calls automatically.

## MCP server

Any MCP-compatible agent can call CAVEAT directly — no frontend, no backend, nothing to
host. `scripts/mcp_server.py` is a local stdio process that turns all 15 contract methods
into MCP tools by calling `genlayer-js`'s Python counterpart (`genlayer-py`) the same way
`scripts/e2e.py` already does. Stop the process and nothing is lost: every fact it exposes
lives on chain, not in the server.

```bash
claude mcp add caveat \
  --env CAVEAT_AGENT_PRIVATE_KEY=0x... \
  --env CAVEAT_PRINCIPAL_PRIVATE_KEY=0x... \
  -- python3 scripts/mcp_server.py
```

Reads (`get_mandate`, `get_proposal`, `is_executable`, `list_mandates`, `list_proposals`,
`proposals_for_mandate`, `authorization_artifact`) need no key — contract reads cost no
gas, so the server binds them to a throwaway, unfunded identity generated once per process.
Writes need whichever key the action requires — `CAVEAT_PRINCIPAL_PRIVATE_KEY` for
`create_mandate`/`activate_mandate`/`revoke_mandate`/`reconfirm`/`reject`,
`CAVEAT_AGENT_PRIVATE_KEY` for `submit_proposal`/`evaluate_proposal`, either for
`consume_approval`. A tool call with no matching key configured returns a clear tool error
instead of crashing the server.

It implements the MCP stdio JSON-RPC protocol directly (initialize, tools/list, tools/call)
rather than depending on the official `mcp` Python package, whose dependency chain pulls in
a from-source Rust build of `cryptography` with no prebuilt wheel on some platforms — slow
and fragile for a project that otherwise needs nothing beyond the RC toolchain already
pinned in `BUILD_DECISIONS.md`. No new dependency was added to `requirements.txt`.

Verified live: `tools/list` returns all 15 tools; `get_mandate`/`list_mandates` read real
on-chain state; `submit_proposal` submitted a real proposal under real consensus.

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
| Cross-chain execution | The gate stays on GenLayer; each chain's executor verifies its own settlement |

## Repository

```text
contracts/caveat.py            the Intelligent Contract — all state, all verdicts
app/                           console: dashboard, mandates, checkpoint, receipt, demo
components/                    ui, mandate, proposal, decision, execution
lib/                           config, types, genlayer client, wallet, fixtures
lib/settlement/                the payment leg — client-side, outside the contract
scripts/deploy.py              deploy to Studio Next + write evidence artifacts
scripts/e2e.py                 full lifecycle on chain
scripts/mcp_server.py          MCP server — the contract, exposed to any agent
test/direct/                   130 in-process tests
test/integration/              5 tests on chain 61997
public/evidence/               first-party evidence pages for the demo
docs/                          architecture, threat model, demo script
BUILD_DECISIONS.md             locked stack and architectural non-negotiables
```

---

**The agent had permission. The world changed. CAVEAT caught it before execution.**
