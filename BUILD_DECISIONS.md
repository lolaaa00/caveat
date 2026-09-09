# CAVEAT — Build Decisions

Locked on Day 1. These are not revisited without a real technical blocker.

## Network / chain

| Item | Decision |
| --- | --- |
| Target network | **GenLayer Studio Next / Studio-dev** |
| Chain ID | **61997** |
| RPC | `https://studio-dev.genlayer.com/api` |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| CLI network name | `studio-dev` |
| genlayer-js chain | `studioDevnet` |
| genlayer-py chain | `studio_devnet` |
| gltest network | `studio_devnet` |
| Consensus family | v0.6 RC (fee stack) |

**Hard rule:** never use StudioNet `61999` config, and never present `61999` evidence as
Studio Next proof. The environments have different chain IDs and different deployments.

## Toolchain (single RC release family — no mixing with stable)

| Component | Version |
| --- | --- |
| GenLayer CLI | `0.40.0-rc.3` (npm, global) |
| genlayer-js | `2.0.0-rc.1` |
| genlayer-py | `0.19.0rc2` |
| genlayer-test (gltest) | `0.30.0rc2` |
| genvm-linter | `0.11.1rc2` |
| GenVM Manager | `v0.6.0-rc3` |
| Intelligent Contract API | `v0.3.0` |
| Node | v20.20.2 |
| Python | 3.12 (local `.venv`; system Python 3.9 is too old for the RC stack) |

## Stack

| Layer | Decision | Why |
| --- | --- | --- |
| Contract | Python / GenVM Intelligent Contract | Authoritative for all state and every verdict |
| Frontend | Next.js + TypeScript (App Router) | Spec default; routing suits mandate/proposal/receipt pages |
| Styling | Tailwind CSS, hand-rolled components | No UI library; execution-terminal aesthetic |
| Wallet | Injected EIP-1193 (MetaMask) on chain 61997 | No browser-generated private keys, ever |
| Fees | genlayer-js RC fee estimation (`estimateTransactionFees`) | Fees are the headline v0.6 change; quotes are always live, never hardcoded |
| Persistence | On-chain + browser-local convenience only | No backend, no service that can become a source of truth |
| Testing | `gltest` direct tests + `gltest --network studio_devnet` integration | Real RPC, real consensus, real receipts |
| Deployment | Deployment-agnostic build; frontend host chosen Day 8 | Free tier only, no card |

Frontend / persistence / deployment were not answered, so the spec's own defaults apply.

## Payment rail (added Day 1 by request; corrected Day 2)

The spec's "no payment rail" exclusion is overridden by explicit instruction. Scope is the
**settlement leg behind the execution gate** — not a payments product.

**Correction, Day 2:** the first implementation verified payments *inside* the Intelligent
Contract, via non-deterministic reads against Sepolia and Solana RPCs. That was wrong.
**GenLayer is the decision and adjudication layer only.** It does not move value, hold value,
or verify payments. Payment verification in the contract made the adjudicator a participant in
settlement, widened its trust surface to third-party RPCs, and coupled a durable decision to a
transient payment.

The corrected boundary:

- The contract's output is a verdict and, for `EXECUTE`, a single-use **authorization artifact**
  returned by `consume_approval`, binding the proposal, the mandate policy judged against, the
  evidence digest and the consumption time. There is no `settle`, `pay`, `transfer` or
  `verify_payment` on the contract, and `test_authorization_artifact.py` enforces that.
- **Sepolia (EVM)** and **Solana devnet** transfers are signed by the principal's own wallet.
  No custody, no key handling by CAVEAT, no mainnet.
- On Sepolia the authorization artifact travels in the payment's calldata, so the payment
  references the decision that permitted it — verifiable by anyone, with GenLayer uninvolved.
- Verification happens **client-side** against the settling chain's own free keyless public RPC
  (`https://ethereum-sepolia-rpc.publicnode.com`, `https://api.devnet.solana.com`). An
  unverifiable hash is never shown as settled.
- The settlement record is browser-local and non-authoritative, and is re-verified against the
  chain rather than trusted.
- Ordering holds because the gate holds: with no consumed approval there is no artifact to pay
  against.
- Zero cost: Sepolia and Solana devnet funds come from free faucets.

## Zero-cost commitment

No paid API keys, no billing, no card, no paid RPC, DB, hosting or monitoring. Evidence retrieval
uses GenLayer validator web access; settlement verification uses keyless public RPCs. If a feature
needs money, it gets cut or replaced, not billed.

## Architectural non-negotiables

1. The Intelligent Contract is the only source of truth for verdicts. The frontend never computes one.
2. Deterministic checks run before any LLM call. A hard-constraint failure is `BLOCK` with no model invocation.
3. The proposing agent cannot supply verdict-producing evidence. Evidence policy is fixed by the principal at mandate creation and frozen on activation.
4. Fixtures may supply evidence and action inputs. Fixtures may never supply verdicts, consensus, transaction status or contract state.
5. Fail closed: unavailable evidence cannot produce `EXECUTE`.
6. Execution approval is one-time. Replay is rejected by the contract.
7. GenLayer adjudicates; it never settles. No payment state, payment verification or value transfer belongs on the contract.
8. `FINALIZED` alone is never treated as success — consensus outcome **and** GenVM execution result are both checked.

## Findings that changed the plan

Recorded so they are not re-litigated later.

1. **Transaction Kit is not a published package.** `genlayerlabs/genlayer-transaction-kit`
   is a private monorepo (`"private": true`, workspace packages) and nothing matching it
   exists on npm. The frontend therefore calls `genlayer-js@2.0.0-rc.1` directly and takes
   its fee quote from `client.estimateTransactionFees()`. Fee values are never hardcoded.
   Revisit if the kit is published.

2. **Deployments and writes revert without a FeesDistribution.** The first deploy attempt
   failed with `FeesDistributionMissing`. Every write in the scripts, tests and frontend
   now carries a live quote.

3. **`FINALIZED` is not success, and finalization is too slow to wait on.** Consensus
   outcome and GenVM execution result are checked separately everywhere. Waits target the
   *decided* outcome: finalization on Studio Next lags well past a demo's patience, and a
   wait for it timed out on a transaction that had already been accepted.

4. **`gl.vm.get_timestamp()` is not implemented in gltest's direct runner.** The contract
   reads transaction time from `gl.message.raw['datetime']`, which is deterministic per
   transaction and works in both real GenVM and direct tests.

5. **Integer type aliases are not callable.** `u256`/`u32` are `typing.Annotated[int, …]`.
   `u256(0)` raises at runtime. They are annotations only.

6. **`prompt_non_comparative` cannot be exercised in direct tests.** Its leader path issues
   an `ExecPromptTemplate` call that gltest's direct runner does not mock, so it always
   fails locally. Evidence extraction uses `prompt_comparative` with a strict principle
   instead — one mechanism, identical in tests and production.

7. **gltest's LLM mock pre-parses JSON.** `exec_prompt(response_format='json')` expects
   JSON *text* on the wire and parses it inside the SDK, so the mock's pre-parsed dict is
   rejected as "JSON result is not text". Tests double-encode via one documented helper;
   the contract keeps the stronger `response_format='json'`.

8. **Per-transaction fee quoting rate-limits Studio.** `sim_getFeeConfig` started failing
   mid-suite. Quotes are cached briefly and retried.

9. **The evidence source must be publicly reachable.** GenLayer validators fetch the
   approved source themselves, so a `localhost` origin cannot serve it. The demo's
   first-party pages live in `public/evidence/` and are served by the app once deployed;
   `NEXT_PUBLIC_EVIDENCE_BASE_URL` overrides the origin. Until the app is hosted somewhere
   public, on-chain scenario runs need a public https source.

10. **gltest clears its configured artifacts directory.** It had been pointed at
    `artifacts/`, and an integration run deleted the committed deployment and lifecycle
    evidence. gltest now writes to `build/gltest`; `artifacts/` holds evidence only.

11. **macOS `python3` is 3.9 and the RC stack has no wheels for it.** The npm scripts call
    `.venv/bin/python` explicitly so a clean clone fails loudly at venv creation rather
    than confusingly at import time.
