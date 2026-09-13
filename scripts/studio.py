"""
Shared Studio Next helpers.

Everything here targets GenLayer Studio Next / Studio-dev, chain 61997. StudioNet 61999
is a different deployment: its addresses and transactions are not evidence for this one.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from genlayer_py import create_account, create_client, generate_private_key
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studio_devnet

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / '.env'
CONTRACT_PATH = ROOT / 'contracts' / 'caveat.py'
ARTIFACTS = ROOT / 'artifacts'

EXPLORER = 'https://explorer-studio-dev.genlayer.com'
CHAIN_ID = 61997

# Studio faucet grant, in wei. Enough for deployment plus a demo run under the v0.6 fee stack.
FUNDING_WEI = 10**21


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            values[key.strip()] = value.strip()
    return values


def write_env(updates: dict[str, str]) -> None:
    """Merge keys into .env, preserving comments and ordering where possible."""
    existing_lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    remaining = dict(updates)
    output: list[str] = []
    for line in existing_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('#') and '=' in stripped:
            key = stripped.split('=', 1)[0].strip()
            if key in remaining:
                output.append(f'{key}={remaining.pop(key)}')
                continue
        output.append(line)
    for key, value in remaining.items():
        output.append(f'{key}={value}')
    ENV_PATH.write_text('\n'.join(output).rstrip() + '\n')


def ensure_key(name: str, env: dict[str, str]) -> str:
    """
    Return a usable testnet private key, generating and persisting one if absent.

    Studio Next is a resettable preview network. These are throwaway testnet keys with
    no value; they are written to .env, which is gitignored, and never to source.
    """
    key = os.environ.get(name) or env.get(name, '')
    if key and key.startswith('0x') and len(key) == 66 and int(key, 16) != 0:
        return key
    key = generate_private_key()
    if not isinstance(key, str):
        key = '0x' + bytes(key).hex()
    write_env({name: key})
    env[name] = key
    print(f'  generated a new testnet key for {name} (saved to .env)')
    return key


def tx_fees(client, options: dict | None = None) -> dict:
    """
    Live fee quote for the v0.6 fee stack. Fees are never hardcoded: the estimate comes
    from the network's current fee policy, and a transaction sent without a
    FeesDistribution is reverted by the consensus contract.
    """
    estimate = client.estimate_transaction_fees(options)
    fees = {'distribution': estimate['distribution'], 'feeValue': estimate['feeValue']}
    allocations = estimate.get('messageAllocations')
    if allocations is not None:
        fees['messageAllocations'] = allocations
    return fees


def studio_client(account=None):
    return create_client(chain=studio_devnet, account=account)


def funded_account(client, private_key: str, label: str):
    account = create_account(account_private_key=private_key)
    try:
        client.fund_account(account.address, FUNDING_WEI)
        print(f'  funded {label} {account.address}')
    except Exception as exc:  # Studio faucet is best-effort; a funded key is fine already
        print(f'  faucet skipped for {label} ({exc})')
    return account


def require_success(
    client,
    tx_hash,
    what: str,
    wait_until: str = 'decided',
    interval: int = 3000,
    retries: int = 60,
) -> dict:
    """
    Consensus outcome and GenVM execution result are two different things. Under
    Consensus v0.6 a transaction can reach a consensus outcome while its execution
    returned an error, so both are checked before anything is reported as successful.

    Waits for a stored decision by default. Finalization on Studio Next lags the
    decision by longer than a demo can wait; pass wait_until="finalized" where the
    stronger guarantee is actually needed. The default retry budget (up to 3 minutes)
    accommodates a real non-deterministic evaluation: validators fetching a live URL
    and running an LLM judgement each take real wall-clock time.
    """
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        wait_until=wait_until,
        full_transaction=True,
        interval=interval,
        retries=retries,
    )
    consensus = receipt.get('status_name') or receipt.get('result_name') or receipt.get('status')
    execution = receipt.get('tx_execution_result_name')
    lifecycle = receipt.get('lifecycle') or {}
    outcome = lifecycle.get('outcome')

    if outcome is not None and outcome not in ('accepted', 'finalized'):
        raise RuntimeError(f'{what} was not accepted by consensus: outcome={outcome}')

    if not tx_execution_succeeded(receipt):
        raise RuntimeError(
            f'{what} did not succeed. consensus={consensus} execution={execution}\n'
            + json.dumps(receipt.get('consensus_data', {}), indent=2, default=str)[:1200]
        )
    if execution is not None and execution != 'FINISHED_WITH_RETURN':
        raise RuntimeError(f'{what} finalized but execution reported {execution}')

    print(f'  {what}: consensus={consensus} execution={execution or "SUCCESS"}')
    return receipt


def explorer_tx(tx_hash) -> str:
    return f'{EXPLORER}/tx/{_hex(tx_hash)}'


def explorer_address(address: str) -> str:
    return f'{EXPLORER}/address/{address}'


def _hex(value) -> str:
    if isinstance(value, str):
        return value
    if hasattr(value, 'hex'):
        text = value.hex()
        return text if text.startswith('0x') else '0x' + text
    return str(value)


def contract_code() -> str:
    return CONTRACT_PATH.read_text()
