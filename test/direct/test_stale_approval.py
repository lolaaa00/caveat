"""
Item 1: closing the stale-approval bypass.

A proposal approved under one mandate commitment must not remain executable once a
*different* proposal against the same mandate is reconfirmed and the commitment moves
on. Before this fix, `is_executable`/`consume_approval` only checked
`status == EXECUTE_APPROVED` and `not approval_consumed` — neither of which changes
when a sibling proposal's reconfirmation re-issues the mandate's commitment. An
approval judged against stale policy stayed nominally "executable" forever.

The fix: both gate methods now also require `proposal.mandate_commitment ==
mandate.commitment` (`_is_stale`), and `reconfirm` deliberately re-issues the
commitment on every call — which is exactly what makes every *other* proposal's
approval stale, by design, not by accident.
"""

from conftest import flight, mandate_of, proposal_of


def _execute(caveat, active_mandate, submit, mock_evidence, mandate_id, arrival='06:45'):
    proposal_id = submit(mandate_id, flight(arrival=arrival))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='OK')
    caveat.evaluate_proposal(proposal_id)
    return proposal_id


def _reconfirm_required(caveat, submit, mock_evidence, mandate_id, arrival='10:30'):
    proposal_id = submit(mandate_id, flight(arrival=arrival))
    mock_evidence(opening_time='08:00', verdict='RECONFIRM', reason='TIMING')
    caveat.evaluate_proposal(proposal_id)
    return proposal_id


def test_headline_scenario_A_executes_B_reconfirms_then_A_goes_stale(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """
    The exact scenario from the spec: proposal A receives EXECUTE, proposal B receives
    RECONFIRM against the same mandate, the principal reconfirms B — and A must then be
    neither executable nor consumable, even though A's own status field still reads
    EXECUTE_APPROVED and its approval was never touched.
    """
    mandate_id = active_mandate()

    proposal_a = _execute(caveat, active_mandate, submit, mock_evidence, mandate_id, arrival='06:45')
    assert caveat.is_executable(proposal_a) is True
    a_before = proposal_of(caveat, proposal_a)
    assert a_before['status'] == 'EXECUTE_APPROVED'
    assert a_before['commitment_stale'] is False

    direct_vm.clear_mocks()
    proposal_b = _reconfirm_required(caveat, submit, mock_evidence, mandate_id, arrival='10:30')
    assert proposal_of(caveat, proposal_b)['status'] == 'RECONFIRM_REQUIRED'

    direct_vm.sender = principal
    caveat.reconfirm(proposal_b)
    assert proposal_of(caveat, proposal_b)['status'] == 'EXECUTE_APPROVED'
    assert caveat.is_executable(proposal_b) is True

    # A is untouched in the database, but the mandate's commitment moved on under it.
    a_after = proposal_of(caveat, proposal_a)
    assert a_after['status'] == 'EXECUTE_APPROVED', 'the stored status is unchanged — staleness is not a status'
    assert a_after['approval_consumed'] is False
    assert a_after['commitment_stale'] is True
    assert a_after['executable'] is False, 'get_proposal must reflect staleness the same way is_executable does'
    assert caveat.is_executable(proposal_a) is False

    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate policy has changed since this proposal was approved'):
        caveat.consume_approval(proposal_a)

    # B, the freshly reconfirmed one, still works normally.
    receipt = caveat.consume_approval(proposal_b)
    assert receipt.startswith('0x')


def test_inverse_ordering_B_executes_A_reconfirms_then_B_goes_stale(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """The same guarantee, proposals reconfirmed/executed in the opposite order."""
    mandate_id = active_mandate()

    proposal_b = _execute(caveat, active_mandate, submit, mock_evidence, mandate_id, arrival='06:45')
    assert caveat.is_executable(proposal_b) is True

    direct_vm.clear_mocks()
    proposal_a = _reconfirm_required(caveat, submit, mock_evidence, mandate_id, arrival='10:30')

    direct_vm.sender = principal
    caveat.reconfirm(proposal_a)
    assert caveat.is_executable(proposal_a) is True

    assert caveat.is_executable(proposal_b) is False
    assert proposal_of(caveat, proposal_b)['commitment_stale'] is True

    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate policy has changed since this proposal was approved'):
        caveat.consume_approval(proposal_b)


def test_reconfirming_a_proposal_does_not_stale_itself(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """
    Sanity check on the mechanism: reconfirm() re-binds the *reconfirmed* proposal's
    own mandate_commitment to the freshly issued one in the same write, so it is never
    stale relative to itself.
    """
    mandate_id = active_mandate()
    proposal_id = _reconfirm_required(caveat, submit, mock_evidence, mandate_id)

    direct_vm.sender = principal
    caveat.reconfirm(proposal_id)

    record = proposal_of(caveat, proposal_id)
    fresh_commitment = mandate_of(caveat, mandate_id)['commitment']
    assert record['mandate_commitment'] == fresh_commitment
    assert record['commitment_stale'] is False
    assert caveat.is_executable(proposal_id) is True

    direct_vm.sender = agent
    receipt = caveat.consume_approval(proposal_id)
    assert receipt.startswith('0x')


def test_replay_is_still_rejected_after_the_staleness_fix(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """The staleness check is additive — the original one-time-use guarantee holds."""
    mandate_id = active_mandate()
    proposal_id = _execute(caveat, active_mandate, submit, mock_evidence, mandate_id)

    direct_vm.sender = agent
    caveat.consume_approval(proposal_id)
    with direct_vm.expect_revert('approval already consumed'):
        caveat.consume_approval(proposal_id)


def test_revocation_still_blocks_a_non_stale_approval(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """Revocation still works independently of the staleness mechanism."""
    mandate_id = active_mandate()
    proposal_id = _execute(caveat, active_mandate, submit, mock_evidence, mandate_id)
    assert proposal_of(caveat, proposal_id)['commitment_stale'] is False

    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)

    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate is not ACTIVE'):
        caveat.consume_approval(proposal_id)


def test_expiry_still_blocks_a_non_stale_approval(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """Expiry still works independently of the staleness mechanism."""
    from conftest import warp

    mandate_id = active_mandate()
    proposal_id = _execute(caveat, active_mandate, submit, mock_evidence, mandate_id)

    warp(direct_vm, '2026-11-02T00:00:00Z')
    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate has expired'):
        caveat.consume_approval(proposal_id)


def test_a_stale_approval_is_permanently_stale_not_just_temporarily_locked(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """
    Staleness is not "awaiting reconfirmation" — a stale EXECUTE_APPROVED proposal has
    no reconfirm() path back (reconfirm() only accepts RECONFIRM_REQUIRED). The agent's
    only real option is to submit a fresh proposal, which is deliberate: CAVEAT does
    not let a principal implicitly re-ratify an approval nobody actually re-evaluated.
    """
    mandate_id = active_mandate()
    proposal_a = _execute(caveat, active_mandate, submit, mock_evidence, mandate_id, arrival='06:45')

    direct_vm.clear_mocks()
    proposal_b = _reconfirm_required(caveat, submit, mock_evidence, mandate_id, arrival='10:30')
    direct_vm.sender = principal
    caveat.reconfirm(proposal_b)

    assert proposal_of(caveat, proposal_a)['commitment_stale'] is True
    direct_vm.sender = principal
    with direct_vm.expect_revert('proposal is not awaiting reconfirmation'):
        caveat.reconfirm(proposal_a)
