"""Shared fixtures for CAVEAT direct (in-process) contract tests."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest
from gltest.direct import create_address

CONTRACT_PATH = Path(__file__).resolve().parents[2] / 'contracts' / 'caveat.py'

# The single approved evidence source for the travel adapter.
CONFERENCE_URL = 'https://gl-agenda.pages.dev/amsterdam-2026/schedule.html'

NOW_ISO = '2026-10-01T09:00:00Z'
NOW_EPOCH = int(datetime(2026, 10, 1, 9, 0, 0, tzinfo=timezone.utc).timestamp())
EXPIRY_EPOCH = int(datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp())

INTENT = (
    'Book the cheapest refundable flight to my conference under EUR 900, '
    'as long as I arrive before the opening session.'
)
PURPOSE = 'Attend the conference in full, including the opening session.'
SEMANTIC_CONDITION = (
    'The traveller must land at the destination before the conference opening '
    'session begins. Never book a non-refundable flight.'
)
RECONFIRM_POLICY = (
    'Any change to a purpose-critical timing condition requires fresh approval '
    'from the principal before execution.'
)

HARD_CONSTRAINTS = [
    {'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': 900},
    {'label': 'Destination', 'field': 'arrival_airport', 'op': 'eq', 'value': 'AMS'},
    {'label': 'Refundability', 'field': 'refundable', 'op': 'is_true'},
]

EVIDENCE_QUESTIONS = [
    {
        'qid': 'conference_opening',
        'question': 'What is the current local start time of the conference opening session?',
        'source_url': CONFERENCE_URL,
        'answer_schema': 'HH:MM in 24-hour local time, or NOT_FOUND',
        'fallback_claim': '',
    }
]

# --- proposal payloads (travel adapter) ---------------------------------------------

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
        'fare_class': 'Economy Flex',
    }


def summary(payload):
    return (
        payload['origin_airport']
        + ' to '
        + payload['arrival_airport']
        + ', EUR '
        + str(payload.get('price_eur', 'unspecified'))
        + ', arrives '
        + payload.get('arrival_local_time', 'unspecified')
        + (', refundable' if payload.get('refundable') else ', NON-REFUNDABLE')
    )


# --- evidence page fixtures ---------------------------------------------------------

def schedule_page(opening_time: str) -> str:
    """A realistic first-party conference schedule page."""
    return (
        'GenLayer Amsterdam 2026 — Programme\n'
        'Venue: Beurs van Berlage, Amsterdam\n'
        'Updated 2026-09-28\n\n'
        'Day 1 — Wednesday 14 October 2026\n'
        '  ' + opening_time + '  Opening session and keynote (Main Hall)\n'
        '  11:00  Track A: Consensus design\n'
        '  13:00  Lunch\n'
        '  14:30  Track B: Agent authorization\n'
    )


# --- LLM response fixtures ----------------------------------------------------------

def _as_wire_json(payload: dict) -> str:
    """
    `exec_prompt(response_format='json')` receives JSON *text* on the wire and parses it
    inside the SDK. gltest's LLM mock helpfully pre-parses any JSON string it is given,
    which the v0.6 decoder then rejects as "JSON result is not text". Double-encoding
    makes the mock hand the SDK exactly what the real runtime would.
    """
    return json.dumps(json.dumps(payload))


def extraction_response(claim: str) -> str:
    return _as_wire_json({'claim': claim, 'quote': claim + '  Opening session and keynote'})


def judgement_response(verdict, reason_code, fact='', confidence='HIGH', rationale='') -> str:
    return _as_wire_json(
        {
            'verdict': verdict,
            'reason_code': reason_code,
            'material_changed_fact': fact,
            'confidence': confidence,
            'short_rationale': rationale or (verdict + ' per mandate conditions.'),
        }
    )


EXTRACTION_PROMPT_PATTERN = r'extract one single fact'
JUDGEMENT_PROMPT_PATTERN = r'semantic checkpoint'


# --- fixtures -----------------------------------------------------------------------


@pytest.fixture
def principal():
    return create_address('caveat_principal')


@pytest.fixture
def agent():
    return create_address('caveat_agent')


@pytest.fixture
def stranger():
    return create_address('caveat_stranger')


@pytest.fixture
def caveat(direct_vm, direct_deploy, principal):
    """A deployed CAVEAT contract with the clock pinned to a known instant."""
    warp(direct_vm, NOW_ISO)
    direct_vm.sender = principal
    return direct_deploy(CONTRACT_PATH)


@pytest.fixture
def make_mandate(direct_vm, caveat, principal, agent):
    """Create a DRAFT travel mandate. Overrides let tests vary one field at a time."""

    def _make(**overrides):
        direct_vm.sender = overrides.pop('sender', principal)
        return caveat.create_mandate(
            overrides.pop('agent', agent).as_hex,
            overrides.pop('intent_text', INTENT),
            overrides.pop('purpose_text', PURPOSE),
            overrides.pop('action_type', 'travel.flight_booking'),
            json.dumps(overrides.pop('hard_constraints', HARD_CONSTRAINTS)),
            overrides.pop('semantic_conditions', SEMANTIC_CONDITION),
            json.dumps(overrides.pop('approved_sources', [CONFERENCE_URL])),
            json.dumps(overrides.pop('evidence_questions', EVIDENCE_QUESTIONS)),
            overrides.pop('reconfirm_policy', RECONFIRM_POLICY),
            overrides.pop('expires_at', EXPIRY_EPOCH),
        )

    return _make


@pytest.fixture
def active_mandate(direct_vm, caveat, make_mandate, principal):
    """An ACTIVE travel mandate, policy frozen."""

    def _make(**overrides):
        mandate_id = make_mandate(**overrides)
        direct_vm.sender = principal
        caveat.activate_mandate(mandate_id)
        return mandate_id

    return _make


@pytest.fixture
def submit(direct_vm, caveat, agent):
    """Submit a proposal as the mandated agent."""

    def _submit(mandate_id, payload=None, sender=None):
        payload = flight() if payload is None else payload
        direct_vm.sender = sender or agent
        return caveat.submit_proposal(mandate_id, json.dumps(payload), summary(payload))

    return _submit


@pytest.fixture
def mock_evidence(direct_vm):
    """Point the approved source and the models at deterministic responses."""

    def _mock(opening_time='08:00', claim=None, verdict=None, reason='', fact=''):
        direct_vm.mock_web(re.escape(CONFERENCE_URL), {'body': schedule_page(opening_time)})
        direct_vm.mock_llm(
            EXTRACTION_PROMPT_PATTERN,
            extraction_response(claim if claim is not None else opening_time),
        )
        if verdict is not None:
            direct_vm.mock_llm(
                JUDGEMENT_PROMPT_PATTERN, judgement_response(verdict, reason, fact)
            )

    return _mock


def proposal_of(caveat, proposal_id):
    return json.loads(caveat.get_proposal(proposal_id))


def mandate_of(caveat, mandate_id):
    return json.loads(caveat.get_mandate(mandate_id))


def check(proposal, label):
    for item in proposal['deterministic_checks']:
        if item['label'] == label:
            return item
    raise AssertionError('no deterministic check labelled ' + label)


def warp(direct_vm, iso: str) -> None:
    """
    Move the transaction clock. `VMContext.warp` does not resync the message datetime
    after the contract module is loaded, so update the message context too.
    """
    import sys

    direct_vm.warp(iso)
    message_mod = sys.modules.get('genlayer.message')
    if message_mod is not None and getattr(message_mod, 'raw', None) is not None:
        message_mod.raw['datetime'] = iso
