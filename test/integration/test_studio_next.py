"""
Integration tests against GenLayer Studio Next (chain 61997).

    gltest --network studio_devnet test/integration

These run on the real network: real deployment, real validators, real fees. They are
slower and cost testnet GEN, so they cover the path that direct tests cannot prove —
that the contract behaves the same inside real GenVM under real consensus.

Accounts are generated and funded from the Studio faucet, so no keys are required.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from genlayer_py import create_account
from gltest import get_contract_factory, get_gl_client
from gltest.assertions import tx_execution_succeeded

FUNDING_WEI = 10**21

INTENT = (
    'Book the cheapest refundable flight to my conference under EUR 900, '
    'as long as I arrive before the opening session.'
)
HARD_CONSTRAINTS = [
    {'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': 900},
    {'label': 'Destination', 'field': 'arrival_airport', 'op': 'eq', 'value': 'AMS'},
    {'label': 'Refundability', 'field': 'refundable', 'op': 'is_true'},
]
EVIDENCE_URL = 'https://example.com/'
EVIDENCE_QUESTIONS = [
    {
        'qid': 'conference_opening',
        'question': 'What is the main heading text of this page?',
        'source_url': EVIDENCE_URL,
        'answer_schema': 'the heading text, or NOT_FOUND',
        'fallback_claim': '',
    }
]


def flight(**overrides):
    payload = {
        'carrier': 'KL',
        'flight_number': 'KL588',
        'origin_airport': 'LOS',
        'arrival_airport': 'AMS',
        'arrival_local_time': '10:30',
        'arrival_date': '2026-10-14',
        'price_eur': 741,
        'refundable': True,
    }
    payload.update(overrides)
    return payload


_FEE_CACHE: dict[str, object] = {}


def fees(client) -> dict:
    """
    A live fee quote. v0.6 reverts any transaction without a FeesDistribution.

    The quote is cached for a short window: the policy read behind it is a separate RPC
    call, and quoting per transaction rate-limits the Studio endpoint mid-suite.
    """
    now = time.time()
    cached = _FEE_CACHE.get('quote')
    if cached is not None and now - float(_FEE_CACHE['at']) < 120:
        return dict(cached)  # type: ignore[arg-type]

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            estimate = client.estimate_transaction_fees()
            quote = {'distribution': estimate['distribution'], 'feeValue': estimate['feeValue']}
            if estimate.get('messageAllocations') is not None:
                quote['messageAllocations'] = estimate['messageAllocations']
            _FEE_CACHE['quote'] = quote
            _FEE_CACHE['at'] = now
            return dict(quote)
        except Exception as error:  # transient Studio RPC failures
            last_error = error
            time.sleep(2 * (attempt + 1))
    if cached is not None:
        return dict(cached)  # type: ignore[arg-type]
    raise AssertionError(f'could not obtain a fee quote from Studio Next: {last_error}')


@pytest.fixture(scope='module')
def client():
    return get_gl_client()


@pytest.fixture(scope='module')
def principal(client):
    account = create_account()
    client.fund_account(account.address, FUNDING_WEI)
    return account


@pytest.fixture(scope='module')
def agent(client):
    account = create_account()
    client.fund_account(account.address, FUNDING_WEI)
    return account


@pytest.fixture(scope='module')
def deployed(client, principal):
    factory = get_contract_factory('Caveat')
    contract = factory.deploy(args=[], account=principal, fees=fees(client))
    return contract


@pytest.fixture(scope='module')
def active_mandate(client, deployed, principal, agent):
    """A live ACTIVE mandate on chain 61997."""
    as_principal = deployed.connect(principal)
    expires_at = int((datetime.now(timezone.utc) + timedelta(days=7)).timestamp())
    receipt = as_principal.create_mandate(
        args=[
            agent.address,
            INTENT,
            'Attend the conference in full, including the opening session.',
            'travel.flight_booking',
            json.dumps(HARD_CONSTRAINTS),
            'The traveller must land before the opening session. Never book a non-refundable flight.',
            json.dumps([EVIDENCE_URL]),
            json.dumps(EVIDENCE_QUESTIONS),
            'Purpose-critical timing changes require fresh principal approval.',
            expires_at,
        ]
    ).transact(fees=fees(client))
    assert tx_execution_succeeded(receipt)

    mandate_id = json.loads(as_principal.list_mandates(args=[]).call())[-1]
    activation = as_principal.activate_mandate(args=[mandate_id]).transact(fees=fees(client))
    assert tx_execution_succeeded(activation)
    assert json.loads(as_principal.get_mandate(args=[mandate_id]).call())['status'] == 'ACTIVE'
    return mandate_id


def submit(client, deployed, agent, mandate_id, payload, summary):
    as_agent = deployed.connect(agent)
    receipt = as_agent.submit_proposal(args=[mandate_id, json.dumps(payload), summary]).transact(fees=fees(client))
    assert tx_execution_succeeded(receipt)
    return json.loads(as_agent.proposals_for_mandate(args=[mandate_id]).call())[-1]


# ---------------------------------------------------------------------------- tests


def test_deployment_reports_a_real_address(deployed):
    assert deployed.address.startswith('0x')
    assert len(deployed.address) == 42


def test_mandate_lifecycle_on_chain(deployed, principal, active_mandate):
    record = json.loads(deployed.connect(principal).get_mandate(args=[active_mandate]).call())
    assert record['status'] == 'ACTIVE'
    assert record['intent_text'] == INTENT, 'wording must survive a round trip through GenVM'
    assert record['commitment'].startswith('0x')


def test_deterministic_block_costs_no_model_call(client, deployed, agent, active_mandate):
    """A hard-constraint failure must be decided by fixed rules inside real GenVM."""
    proposal_id = submit(
        client,
        deployed,
        agent,
        active_mandate,
        flight(refundable=False, arrival_local_time='06:45'),
        'LOS to AMS, EUR 741, arrives 06:45, NON-REFUNDABLE',
    )
    as_agent = deployed.connect(agent)
    receipt = as_agent.evaluate_proposal(args=[proposal_id]).transact(fees=fees(client))
    assert tx_execution_succeeded(receipt)

    record = json.loads(as_agent.get_proposal(args=[proposal_id]).call())
    assert record['verdict'] == 'BLOCK'
    assert record['reason_code'] == 'DETERMINISTIC_CONSTRAINT_FAILED'
    assert record['evidence'] == [], 'no source should be queried after a hard failure'
    assert record['executable'] is False
    assert as_agent.is_executable(args=[proposal_id]).call() is False


def test_live_evidence_and_semantic_judgement_under_consensus(
    client, deployed, agent, active_mandate
):
    """
    The full non-deterministic path on chain: validators fetch the approved source,
    the model judges under an equivalence principle, and the contract records a
    structured verdict. The verdict itself is whatever consensus produced.
    """
    proposal_id = submit(
        client,
        deployed,
        agent,
        active_mandate,
        flight(arrival_local_time='10:30'),
        'LOS to AMS, EUR 741, arrives 10:30, refundable',
    )
    as_agent = deployed.connect(agent)
    receipt = as_agent.evaluate_proposal(args=[proposal_id]).transact(fees=fees(client))
    assert tx_execution_succeeded(receipt)

    record = json.loads(as_agent.get_proposal(args=[proposal_id]).call())
    assert record['verdict'] in ('EXECUTE', 'RECONFIRM', 'BLOCK')
    assert all(check['passed'] for check in record['deterministic_checks'])
    assert len(record['evidence']) == 1
    assert record['evidence'][0]['source_url'] == EVIDENCE_URL
    assert record['evidence'][0]['retrieval_class'] in ('LIVE', 'UNAVAILABLE')
    assert record['evidence_digest'].startswith('0x')
    assert record['reason_code'] != ''
    # Whatever the verdict, execution is only ever open for EXECUTE.
    assert record['executable'] is (record['verdict'] == 'EXECUTE')


def test_execution_gate_is_one_time_on_chain(client, deployed, principal, agent, active_mandate):
    """
    Drive whichever branch consensus produced to a consumed approval, then prove the
    replay is rejected by the real contract.
    """
    proposal_id = submit(
        client,
        deployed,
        agent,
        active_mandate,
        flight(arrival_local_time='06:45'),
        'LOS to AMS, EUR 741, arrives 06:45, refundable',
    )
    as_agent = deployed.connect(agent)
    as_principal = deployed.connect(principal)
    assert tx_execution_succeeded(as_agent.evaluate_proposal(args=[proposal_id]).transact(fees=fees(client)))

    record = json.loads(as_agent.get_proposal(args=[proposal_id]).call())
    if record['status'] == 'RECONFIRM_REQUIRED':
        assert as_agent.is_executable(args=[proposal_id]).call() is False, 'must stay locked'
        assert tx_execution_succeeded(as_principal.reconfirm(args=[proposal_id]).transact(fees=fees(client)))
        record = json.loads(as_agent.get_proposal(args=[proposal_id]).call())

    if record['status'] != 'EXECUTE_APPROVED':
        pytest.skip(f'consensus returned {record["verdict"]}; no approval to consume')

    assert as_agent.is_executable(args=[proposal_id]).call() is True
    assert tx_execution_succeeded(as_agent.consume_approval(args=[proposal_id]).transact(fees=fees(client)))
    assert as_agent.is_executable(args=[proposal_id]).call() is False

    replay = as_agent.consume_approval(args=[proposal_id]).transact(fees=fees(client))
    assert not tx_execution_succeeded(replay), 'a replayed approval must fail on chain'
