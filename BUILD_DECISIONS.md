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
| Fees | GenLayer Transaction Kit (v0.6 fee approval + tracking) | Fees are the headline v0.6 change; never hardcode fee numbers |
| Persistence | On-chain + browser-local convenience only | No backend, no service that can become a source of truth |
| Testing | `gltest` direct tests + `gltest --network studio_devnet` integration | Real RPC, real consensus, real receipts |
| Deployment | Deployment-agnostic build; frontend host chosen Day 8 | Free tier only, no card |

Frontend / persistence / deployment were not answered, so the spec's own defaults apply.

## Payment rail (added Day 1 by request)

The spec's "no payment rail" exclusion is overridden by explicit instruction. Scope is kept to
the **settlement leg of the execution gate** — not a payments product:

- **Sepolia (EVM)** and **Solana devnet** testnet value transfers, signed by the principal's own
  wallet. No custody, no key handling by CAVEAT, no mainnet.
- Ordering is enforced by the contract: a settlement can only be recorded against a proposal that
  reached `EXECUTE_APPROVED` **and** had its one-time approval consumed. Payment can never precede
  the verdict.
- Settlement is **verified**, not asserted: the contract confirms the transaction through a
  non-deterministic read against a free keyless public RPC
  (`https://api.devnet.solana.com`, `https://ethereum-sepolia-rpc.publicnode.com`) under an
  equivalence principle. A tx hash that does not verify is not recorded as settled.
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
7. `FINALIZED` alone is never treated as success — consensus outcome **and** GenVM execution result are both checked.
