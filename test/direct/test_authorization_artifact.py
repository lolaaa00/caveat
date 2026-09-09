"""
The gate is the boundary of CAVEAT's responsibility.

GenLayer is a decision and adjudication layer. It must not move value, hold value, or
verify payments. Its output is a verdict and, for EXECUTE, a single-use authorization
artifact that downstream execution carries as proof it was allowed.
"""

from conftest import flight, mandate_of, proposal_of


def _approved(caveat, active_mandate, submit, mock_evidence):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='INTENT_SATISFIED')
    caveat.evaluate_proposal(proposal_id)
    return mandate_id, proposal_id


# --- the contract exposes no payment surface ----------------------------------------


def test_the_contract_has_no_payment_surface(caveat):
    """
    Settling, transferring, verifying a transaction or holding a balance are all outside
    the adjudication layer. None of it may appear on this contract.
    """
    for forbidden in (
        'record_settlement',
        'settlement_of',
        'settle',
        'pay',
        'transfer',
        'withdraw',
        'deposit',
        'verify_payment',
        'balance_of',
        'escrow',
        'release_funds',
    ):
        assert not hasattr(caveat, forbidden), (
            forbidden + ' must not exist: GenLayer decides, it does not settle'
        )


def test_the_proposal_record_carries_no_payment_state(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    _, proposal_id = _approved(caveat, active_mandate, submit, mock_evidence)
    direct_vm.sender = agent
    caveat.consume_approval(proposal_id)

    record = proposal_of(caveat, proposal_id)
    for key in record:
        assert 'settle' not in key, 'no settlement state belongs on the decision record'
        assert 'payee' not in key
        assert 'amount' not in key
        assert 'tx_hash' not in key


# --- the authorization artifact ------------------------------------------------------


def test_consuming_the_approval_returns_a_binding_artifact(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """
    The digest is what downstream execution presents. It has to bind the decision, not
    merely identify the proposal.
    """
    _, proposal_id = _approved(caveat, active_mandate, submit, mock_evidence)
    direct_vm.sender = agent
    artifact = caveat.consume_approval(proposal_id)

    assert artifact.startswith('0x') and len(artifact) == 66
    record = proposal_of(caveat, proposal_id)
    assert record['approval_consumed'] is True
    assert record['consumed_at'] > 0
    # The inputs the artifact commits to are all on the receipt, so a verifier can
    # recompute it from public state.
    assert record['mandate_commitment'].startswith('0x')
    assert record['evidence_digest'].startswith('0x')


def test_the_artifact_differs_per_decision(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """Two authorizations must never produce the same artifact."""
    _, first = _approved(caveat, active_mandate, submit, mock_evidence)
    direct_vm.clear_mocks()
    _, second = _approved(caveat, active_mandate, submit, mock_evidence)

    direct_vm.sender = agent
    first_artifact = caveat.consume_approval(first)
    second_artifact = caveat.consume_approval(second)
    assert first_artifact != second_artifact


def test_the_artifact_is_bound_to_the_policy_that_was_judged(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """
    A reconfirmed action is authorized under freshly issued authority, and the artifact
    must reflect the commitment in force at consumption.
    """
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='10:30'))
    mock_evidence(opening_time='08:00', verdict='RECONFIRM', reason='TIMING')
    caveat.evaluate_proposal(proposal_id)

    direct_vm.sender = principal
    caveat.reconfirm(proposal_id)
    fresh_commitment = mandate_of(caveat, mandate_id)['commitment']

    direct_vm.sender = agent
    caveat.consume_approval(proposal_id)
    assert proposal_of(caveat, proposal_id)['mandate_commitment'] == fresh_commitment


def test_no_artifact_exists_without_an_approval(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """A locked or refused decision authorizes nothing downstream."""
    mandate_id = active_mandate()
    locked = submit(mandate_id, flight(arrival='10:30'))
    mock_evidence(opening_time='08:00', verdict='RECONFIRM', reason='TIMING')
    caveat.evaluate_proposal(locked)

    direct_vm.sender = agent
    with direct_vm.expect_revert('execution is locked: proposal is RECONFIRM_REQUIRED'):
        caveat.consume_approval(locked)
    assert proposal_of(caveat, locked)['approval_consumed'] is False
