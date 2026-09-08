"""
The semantic checkpoint: evidence retrieval and the EXECUTE / RECONFIRM / BLOCK /
INCONCLUSIVE outcomes. These are the three demo scenarios plus the failure modes.
"""

from conftest import CONFERENCE_URL, flight, proposal_of


def test_context_drift_returns_reconfirm(caveat, active_mandate, submit, mock_evidence):
    """
    Demo scenario A. Every deterministic check passes and the agent still holds valid
    authority, but the conference moved to 08:00 and the flight lands at 10:30.
    """
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='10:30'))
    mock_evidence(
        opening_time='08:00',
        verdict='RECONFIRM',
        reason='PURPOSE_CRITICAL_TIMING_UNSATISFIED',
        fact='Conference opening moved to 08:00; flight lands 10:30.',
    )

    assert caveat.evaluate_proposal(proposal_id) == 'RECONFIRM'
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'RECONFIRM_REQUIRED'
    assert record['reason_code'] == 'PURPOSE_CRITICAL_TIMING_UNSATISFIED'
    assert record['executable'] is False, 'execution must stay locked'
    assert caveat.is_executable(proposal_id) is False
    assert record['evidence'][0]['claim'] == '08:00'
    assert record['evidence'][0]['retrieval_class'] == 'LIVE'
    assert record['evidence'][0]['source_url'] == CONFERENCE_URL
    assert record['evidence_digest'].startswith('0x')


def test_intent_still_satisfied_returns_execute(caveat, active_mandate, submit, mock_evidence):
    """Demo scenario B. Same mandate, earlier arrival, so the purpose still holds."""
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='INTENT_SATISFIED')

    assert caveat.evaluate_proposal(proposal_id) == 'EXECUTE'
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'EXECUTE_APPROVED'
    assert record['executable'] is True
    assert caveat.is_executable(proposal_id) is True


def test_explicit_prohibition_returns_block(caveat, active_mandate, submit, mock_evidence):
    """A semantic BLOCK, distinct from the deterministic BLOCK path."""
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='BLOCK', reason='MANDATE_PROHIBITION')

    assert caveat.evaluate_proposal(proposal_id) == 'BLOCK'
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'BLOCKED'
    assert record['executable'] is False


def test_unavailable_evidence_fails_closed_as_reconfirm(
    caveat, active_mandate, submit, mock_evidence
):
    """
    The source cannot answer the question. No judgement is attempted: the contract
    fails closed, keeps INCONCLUSIVE internally and surfaces RECONFIRM.
    """
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', claim='NOT_FOUND')  # no judgement mock registered

    assert caveat.evaluate_proposal(proposal_id) == 'RECONFIRM'
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'RECONFIRM_REQUIRED'
    assert record['reason_code'] == 'EVIDENCE_UNAVAILABLE'
    assert record['evidence'][0]['retrieval_class'] == 'UNAVAILABLE'
    assert record['confidence'] == 'LOW'
    assert record['executable'] is False


def test_principal_fallback_evidence_can_never_authorize_execution(
    caveat, active_mandate, submit, mock_evidence
):
    """
    A principal may pin a deterministic fallback claim so a demo survives an outage,
    but a fact that is not independently current must never unlock execution.
    """
    questions = [
        {
            'qid': 'conference_opening',
            'question': 'What is the current local start time of the conference opening session?',
            'source_url': CONFERENCE_URL,
            'answer_schema': 'HH:MM in 24-hour local time, or NOT_FOUND',
            'fallback_claim': '08:00',
        }
    ]
    mandate_id = active_mandate(evidence_questions=questions)
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', claim='NOT_FOUND', verdict='EXECUTE', reason='FINE')

    assert caveat.evaluate_proposal(proposal_id) == 'RECONFIRM'
    record = proposal_of(caveat, proposal_id)
    assert record['reason_code'] == 'EVIDENCE_FALLBACK_NO_EXECUTE'
    assert record['evidence'][0]['retrieval_class'] == 'FALLBACK'
    assert record['evidence'][0]['claim'] == '08:00'
    assert record['executable'] is False


def test_unparseable_judgement_becomes_reconfirm(caveat, active_mandate, submit, mock_evidence):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='PROBABLY_FINE', reason='WHATEVER')

    assert caveat.evaluate_proposal(proposal_id) == 'RECONFIRM'
    record = proposal_of(caveat, proposal_id)
    assert record['reason_code'] == 'JUDGEMENT_INCONCLUSIVE'
    assert record['status'] == 'RECONFIRM_REQUIRED'


def test_receipt_links_mandate_proposal_evidence_and_verdict(
    caveat, active_mandate, submit, mock_evidence
):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='10:30'))
    mock_evidence(
        opening_time='08:00',
        verdict='RECONFIRM',
        reason='PURPOSE_CRITICAL_TIMING_UNSATISFIED',
        fact='Opening moved to 08:00.',
    )
    caveat.evaluate_proposal(proposal_id)

    record = proposal_of(caveat, proposal_id)
    assert record['mandate_id'] == mandate_id
    assert record['proposal_id'] == proposal_id
    assert record['verdict'] == 'RECONFIRM'
    assert record['material_changed_fact'] == 'Opening moved to 08:00.'
    assert record['decided_at'] > 0
    assert record['mandate_commitment'].startswith('0x')
    assert record['action_payload']['price_eur'] == 741
    assert 'Budget' in [c['label'] for c in record['deterministic_checks']]


def test_evidence_digest_binds_the_retrieved_claim(
    caveat, active_mandate, submit, mock_evidence, direct_vm
):
    """Two proposals judged against different world states get different digests."""
    first_mandate = active_mandate()
    first = submit(first_mandate, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='OK')
    caveat.evaluate_proposal(first)

    direct_vm.clear_mocks()  # mocks match first-registered-wins
    second_mandate = active_mandate()
    second = submit(second_mandate, flight(arrival='06:45'))
    mock_evidence(opening_time='06:00', claim='06:00', verdict='RECONFIRM', reason='MOVED')
    caveat.evaluate_proposal(second)

    a = proposal_of(caveat, first)
    b = proposal_of(caveat, second)
    assert a['evidence'][0]['claim'] == '08:00'
    assert b['evidence'][0]['claim'] == '06:00'
    assert a['evidence_digest'] != b['evidence_digest']
