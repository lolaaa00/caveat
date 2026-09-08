"""
Deterministic pre-checks.

These must decide BLOCK without ever invoking a model. Every test here registers
*no* LLM mock: if the contract reached the model, the call would fail loudly.
"""

import json

from conftest import check, flight, proposal_of, summary, warp


def test_valid_proposal_passes_every_deterministic_check(
    caveat, active_mandate, submit, mock_evidence
):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id)
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='INTENT_SATISFIED')
    caveat.evaluate_proposal(proposal_id)

    record = proposal_of(caveat, proposal_id)
    for label in ('Authorization', 'Mandate active', 'Mandate not expired', 'Policy unchanged',
                  'Budget', 'Destination', 'Refundability'):
        assert check(record, label)['passed'], label + ' should pass'


def test_budget_failure_blocks_without_a_model_call(caveat, active_mandate, submit):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(price_eur=1240))

    assert caveat.evaluate_proposal(proposal_id) == 'BLOCK'
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'BLOCKED'
    assert record['reason_code'] == 'DETERMINISTIC_CONSTRAINT_FAILED'
    assert record['material_changed_fact'] == 'Budget'
    assert check(record, 'Budget')['passed'] is False
    assert record['evidence'] == [], 'no evidence should be retrieved after a hard failure'


def test_destination_failure_blocks(caveat, active_mandate, submit):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(airport='CDG'))
    assert caveat.evaluate_proposal(proposal_id) == 'BLOCK'
    assert check(proposal_of(caveat, proposal_id), 'Destination')['passed'] is False


def test_non_refundable_flight_blocks(caveat, active_mandate, submit):
    """Demo fixture 3: an explicitly prohibited action."""
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(refundable=False))
    assert caveat.evaluate_proposal(proposal_id) == 'BLOCK'
    record = proposal_of(caveat, proposal_id)
    assert check(record, 'Refundability')['passed'] is False
    assert record['status'] == 'BLOCKED'


def test_missing_required_field_fails_closed(caveat, active_mandate, submit):
    payload = flight()
    del payload['price_eur']
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, payload)
    assert caveat.evaluate_proposal(proposal_id) == 'BLOCK'
    budget = check(proposal_of(caveat, proposal_id), 'Budget')
    assert budget['passed'] is False
    assert budget['actual'] == '<missing>'


def test_unauthorized_agent_cannot_submit(caveat, active_mandate, submit, direct_vm, stranger):
    mandate_id = active_mandate()
    with direct_vm.expect_revert(
        'only the authorized agent may submit proposals for this mandate'
    ):
        submit(mandate_id, sender=stranger)


def test_draft_mandate_cannot_receive_proposals(caveat, make_mandate, submit, direct_vm):
    mandate_id = make_mandate()
    with direct_vm.expect_revert('mandate is not ACTIVE'):
        submit(mandate_id)


def test_revoked_mandate_cannot_receive_proposals(
    caveat, active_mandate, submit, direct_vm, principal
):
    mandate_id = active_mandate()
    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)
    with direct_vm.expect_revert('mandate is not ACTIVE'):
        submit(mandate_id)


def test_expired_mandate_cannot_receive_proposals(caveat, active_mandate, submit, direct_vm):
    mandate_id = active_mandate()
    warp(direct_vm, '2026-11-02T00:00:00Z')
    with direct_vm.expect_revert('mandate has expired'):
        submit(mandate_id)


def test_proposal_submitted_before_expiry_blocks_at_evaluation(
    caveat, active_mandate, submit, direct_vm
):
    """Authority can go stale between submission and evaluation."""
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id)
    warp(direct_vm, '2026-11-02T00:00:00Z')
    assert caveat.evaluate_proposal(proposal_id) == 'BLOCK'
    assert check(proposal_of(caveat, proposal_id), 'Mandate not expired')['passed'] is False


def test_a_proposal_can_only_be_evaluated_once(caveat, active_mandate, submit, direct_vm):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(price_eur=1240))
    caveat.evaluate_proposal(proposal_id)
    with direct_vm.expect_revert('proposal has already been evaluated'):
        caveat.evaluate_proposal(proposal_id)


def test_malformed_action_payload_is_rejected(caveat, active_mandate, direct_vm, agent):
    mandate_id = active_mandate()
    direct_vm.sender = agent
    with direct_vm.expect_revert('action_payload_json is not valid JSON'):
        caveat.submit_proposal(mandate_id, 'not json at all', 'nonsense')


def test_proposal_index_is_queryable_per_mandate(caveat, active_mandate, submit):
    first_mandate = active_mandate()
    second_mandate = active_mandate()
    a = submit(first_mandate)
    b = submit(first_mandate, flight(price_eur=650))
    c = submit(second_mandate)
    assert json.loads(caveat.proposals_for_mandate(first_mandate)) == [a, b]
    assert json.loads(caveat.proposals_for_mandate(second_mandate)) == [c]
