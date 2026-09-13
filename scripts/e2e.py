"""
End-to-end lifecycle against the deployed CAVEAT contract on Studio Next.

    python3 scripts/e2e.py                # live evidence from the approved source
    python3 scripts/e2e.py --scenario a   # a single scenario

Every verdict here comes from the contract: real validators, real web retrieval, real
model judgement. Nothing in this script decides an outcome.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

from studio import (
    ARTIFACTS,
    ensure_key,
    explorer_tx,
    funded_account,
    read_env,
    require_success,
    studio_client,
    tx_fees,
    _hex,
)

# The approved evidence source. Override with EVIDENCE_BASE_URL in .env to point at
# your own first-party schedule page once the frontend is deployed.
DEFAULT_EVIDENCE_URL = 'https://example.com/'

INTENT = (
    'Book the cheapest refundable flight to my conference under EUR 900, '
    'as long as I arrive before the opening session.'
)
PURPOSE = 'Attend the conference in full, including the opening session.'
SEMANTIC = (
    'The traveller should land at the destination before the conference opening session '
    'begins, because the opening session is why this trip is being taken. If the current '
    'schedule means the flight would now arrive after the opening session has already '
    'started, that is a change in circumstances since this mandate was granted, not a '
    'violation of it: pause and get my explicit reconfirmation rather than booking, and '
    'do not treat it as an outright prohibition. Never book a non-refundable flight '
    'under any circumstance; that prohibition is absolute and is never subject to '
    'reconfirmation.'
)
HARD_CONSTRAINTS = [
    {'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': 900},
    {'label': 'Destination', 'field': 'arrival_airport', 'op': 'eq', 'value': 'AMS'},
    {'label': 'Refundability', 'field': 'refundable', 'op': 'is_true'},
]


def flight(price_eur=741, refundable=True, arrival='10:30', airport='AMS'):
    return {
        'carrier': 'KL',
        'flight_number': 'KL588',
        'origin_airport': 'LOS',
        'arrival_airport': airport,
        'arrival_local_time': arrival,
        'arrival_date': '2026-10-14',
        'price_eur': price_eur,
        'refundable': refundable,
    }


class Session:
    def __init__(self, address: str, principal, agent):
        self.address = address
        self.principal = principal
        self.agent = agent
        self.principal_client = studio_client(account=principal)
        self.agent_client = studio_client(account=agent)
        self.transactions: list[dict] = []

    def _client(self, actor: str):
        return self.principal_client if actor == 'principal' else self.agent_client

    def write(self, actor: str, function_name: str, args: list, label: str):
        client = self._client(actor)
        account = self.principal if actor == 'principal' else self.agent
        fees = tx_fees(client)
        tx_hash = client.write_contract(
            address=self.address,
            function_name=function_name,
            args=args,
            account=account,
            fees=fees,
        )
        receipt = require_success(client, tx_hash, label)
        self.transactions.append(
            {'label': label, 'tx': _hex(tx_hash), 'explorer': explorer_tx(tx_hash)}
        )
        return receipt

    def read(self, function_name: str, args: list):
        return self.principal_client.read_contract(
            address=self.address, function_name=function_name, args=args
        )


def _returned_value(receipt) -> str | None:
    """Pull the contract return value out of the leader receipt."""
    consensus = receipt.get('consensus_data') or {}
    leader = consensus.get('leader_receipt')
    if isinstance(leader, dict):
        leader = [leader]
    if isinstance(leader, list) and leader:
        for key in ('result', 'returned', 'return_value'):
            if key in leader[0]:
                return leader[0][key]
    return None


def build_mandate(session: Session, evidence_url: str, question: str, schema: str) -> str:
    expires_at = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    evidence_questions = [
        {
            'qid': 'conference_opening',
            'question': question,
            'source_url': evidence_url,
            'answer_schema': schema,
            'fallback_claim': '',
        }
    ]
    receipt = session.write(
        'principal',
        'create_mandate',
        [
            session.agent.address,
            INTENT,
            PURPOSE,
            'travel.flight_booking',
            json.dumps(HARD_CONSTRAINTS),
            SEMANTIC,
            json.dumps([evidence_url]),
            json.dumps(evidence_questions),
            'Any change to a purpose-critical timing condition requires fresh approval.',
            expires_at,
        ],
        'create_mandate',
    )
    mandate_id = _returned_value(receipt)
    if not isinstance(mandate_id, str):
        mandate_ids = json.loads(session.read('list_mandates', []))
        mandate_id = mandate_ids[-1]
    session.write('principal', 'activate_mandate', [mandate_id], 'activate_mandate')
    print(f'  mandate {mandate_id} is ACTIVE')
    return mandate_id


def run_scenario(session: Session, mandate_id: str, name: str, payload: dict, note: str):
    print(f'\n--- {name}: {note}')
    receipt = session.write(
        'agent',
        'submit_proposal',
        [mandate_id, json.dumps(payload), note],
        'submit_proposal',
    )
    proposal_id = _returned_value(receipt)
    if not isinstance(proposal_id, str):
        proposal_id = json.loads(session.read('proposals_for_mandate', [mandate_id]))[-1]

    session.write('agent', 'evaluate_proposal', [proposal_id], 'evaluate_proposal')
    record = json.loads(session.read('get_proposal', [proposal_id]))

    print(f'  proposal      {proposal_id}')
    print(f'  checks        ' + ', '.join(
        ('PASS ' if c['passed'] else 'FAIL ') + c['label'] for c in record['deterministic_checks']
    ))
    for item in record['evidence']:
        print(f'  evidence      {item["claim"]!r} ({item["retrieval_class"]}) from {item["source_url"]}')
    print(f'  VERDICT       {record["verdict"]}  ({record["reason_code"]})')
    print(f'  rationale     {record["short_rationale"][:160]}')
    print(f'  executable    {record["executable"]}')
    return proposal_id, record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario', choices=['a', 'b', 'c', 'all'], default='all')
    parser.add_argument('--evidence-url', default=None)
    parser.add_argument(
        '--question',
        default='What is the current local start time of the conference opening session?',
    )
    parser.add_argument('--schema', default='HH:MM in 24-hour local time, or NOT_FOUND')
    options = parser.parse_args()

    env = read_env()
    deployment_path = ARTIFACTS / 'deployment.studio_devnet.json'
    if not deployment_path.exists():
        print('No deployment found. Run `python3 scripts/deploy.py` first.', file=sys.stderr)
        return 1
    deployment = json.loads(deployment_path.read_text())
    address = deployment['contract_address']

    evidence_url = (
        options.evidence_url or env.get('EVIDENCE_BASE_URL') or DEFAULT_EVIDENCE_URL
    )

    print(f'CAVEAT end-to-end on Studio Next  contract={address}')
    print(f'  evidence source: {evidence_url}')

    bootstrap = studio_client()
    principal = funded_account(
        bootstrap, ensure_key('CAVEAT_PRINCIPAL_PRIVATE_KEY', env), 'principal'
    )
    agent = funded_account(bootstrap, ensure_key('CAVEAT_AGENT_PRIVATE_KEY', env), 'agent')
    session = Session(address, principal, agent)

    mandate_id = build_mandate(session, evidence_url, options.question, options.schema)
    results = {}

    if options.scenario in ('a', 'all'):
        proposal_id, record = run_scenario(
            session, mandate_id, 'Scenario A', flight(arrival='10:30'),
            'LOS to AMS, EUR 741, arrives 10:30, refundable',
        )
        results['a'] = {'proposal': proposal_id, 'verdict': record['verdict']}
        if record['status'] == 'RECONFIRM_REQUIRED':
            print('  execution is locked; principal supplies fresh approval')
            session.write('principal', 'reconfirm', [proposal_id], 'reconfirm')
            print(f'  is_executable -> {session.read("is_executable", [proposal_id])}')

    if options.scenario in ('b', 'all'):
        proposal_id, record = run_scenario(
            session, mandate_id, 'Scenario B', flight(arrival='06:45'),
            'LOS to AMS, EUR 741, arrives 06:45, refundable',
        )
        results['b'] = {'proposal': proposal_id, 'verdict': record['verdict']}
        if record['executable']:
            session.write('agent', 'consume_approval', [proposal_id], 'consume_approval')
            print(f'  approval consumed; is_executable -> '
                  f'{session.read("is_executable", [proposal_id])}')

    if options.scenario in ('c', 'all'):
        proposal_id, record = run_scenario(
            session, mandate_id, 'Scenario C', flight(refundable=False, arrival='06:45'),
            'LOS to AMS, EUR 741, arrives 06:45, NON-REFUNDABLE',
        )
        results['c'] = {'proposal': proposal_id, 'verdict': record['verdict']}

    evidence_path = ARTIFACTS / 'e2e.studio_devnet.json'
    evidence_path.write_text(
        json.dumps(
            {
                'contract_address': address,
                'evidence_source': evidence_url,
                'mandate_id': mandate_id,
                'scenarios': results,
                'transactions': session.transactions,
                'ran_at': datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        )
        + '\n'
    )
    print(f'\n  {len(session.transactions)} transactions recorded in {evidence_path.name}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
