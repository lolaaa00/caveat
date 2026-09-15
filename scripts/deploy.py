"""
Deploy CAVEAT to GenLayer Studio Next (chain 61997) and record the evidence.

    python3 scripts/deploy.py

Writes artifacts/deployment.studio_devnet.json and updates .env with the address.
Nothing is reported as deployed unless consensus *and* GenVM execution both succeeded.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from studio import (
    ARTIFACTS,
    CHAIN_ID,
    contract_code,
    ensure_key,
    explorer_address,
    explorer_tx,
    funded_account,
    read_env,
    require_success,
    runtime_pin,
    schema_parity,
    source_commit,
    studio_client,
    tx_fees,
    write_env,
    _hex,
)


def main() -> int:
    print('CAVEAT -> GenLayer Studio Next (studio_devnet, chain 61997)')
    env = read_env()
    principal_key = ensure_key('CAVEAT_PRINCIPAL_PRIVATE_KEY', env)
    ensure_key('CAVEAT_AGENT_PRIVATE_KEY', env)

    client = studio_client()
    principal = funded_account(client, principal_key, 'principal')
    client = studio_client(account=principal)

    fees = tx_fees(client)
    print(f'  fee quote: {fees["feeValue"]} wei (live estimate, not hardcoded)')

    print('  deploying contract...')
    tx_hash = client.deploy_contract(code=contract_code(), account=principal, fees=fees)
    receipt = require_success(client, tx_hash, 'deployment')

    address = (
        receipt.get('contract_address')
        or (receipt.get('data') or {}).get('contract_address')
        or (receipt.get('tx_data_decoded') or {}).get('contract_address')
    )
    if not address:
        print('deployment finalized but no contract address was returned:', file=sys.stderr)
        print(json.dumps(receipt, indent=2, default=str)[:2000], file=sys.stderr)
        return 1

    print('  checking schema parity against local source...')
    try:
        parity = schema_parity(client, address)
    except Exception as exc:  # noqa: BLE001 - parity is evidence, not a deploy gate
        parity = {'matches': None, 'error': str(exc)}

    record = {
        'network': 'studio_devnet',
        'chain_id': CHAIN_ID,
        'contract_address': address,
        'deployment_tx': _hex(tx_hash),
        'deployer': principal.address,
        'deployed_at': datetime.now(timezone.utc).isoformat(),
        'explorer_contract': explorer_address(address),
        'explorer_tx': explorer_tx(tx_hash),
        'source_commit': source_commit(),
        'runtime': runtime_pin(),
        'schema_parity': parity,
    }
    ARTIFACTS.mkdir(exist_ok=True)
    target = ARTIFACTS / 'deployment.studio_devnet.json'
    target.write_text(json.dumps(record, indent=2) + '\n')
    write_env({'NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS': address})

    print()
    print('  contract  ', address)
    print('  tx        ', _hex(tx_hash))
    print('  explorer  ', record['explorer_contract'])
    print('  commit    ', record['source_commit'])
    print('  runtime   ', record['runtime'])
    print('  parity    ', 'MATCH' if parity.get('matches') else parity)
    print('  recorded  ', target.relative_to(target.parents[1]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
