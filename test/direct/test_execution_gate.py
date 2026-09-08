"""
The one-time execution gate and the reconfirmation flow.

Only EXECUTE unlocks execution, the approval is consumable exactly once, and a
paused action stays locked until the principal personally re-authorizes it.
"""

from conftest import flight, mandate_of, proposal_of, warp


def _reconfirm_case(caveat, active_mandate, submit, mock_evidence):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='10:30'))
    mock_evidence(
        opening_time='08:00',
        verdict='RECONFIRM',
        reason='PURPOSE_CRITICAL_TIMING_UNSATISFIED',
        fact='Opening moved to 08:00.',
    )
    caveat.evaluate_proposal(proposal_id)
    return mandate_id, proposal_id


def _execute_case(caveat, active_mandate, submit, mock_evidence):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='INTENT_SATISFIED')
    caveat.evaluate_proposal(proposal_id)
    return mandate_id, proposal_id


def test_reconfirm_verdict_locks_execution(caveat, active_mandate, submit, mock_evidence,
                                           direct_vm, agent):
    _, proposal_id = _reconfirm_case(caveat, active_mandate, submit, mock_evidence)
    assert caveat.is_executable(proposal_id) is False
    direct_vm.sender = agent
    with direct_vm.expect_revert('execution is locked: proposal is RECONFIRM_REQUIRED'):
        caveat.consume_approval(proposal_id)


def test_blocked_proposal_can_never_be_executed(caveat, active_mandate, submit, direct_vm, agent):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(refundable=False))
    caveat.evaluate_proposal(proposal_id)
    assert caveat.is_executable(proposal_id) is False
    direct_vm.sender = agent
    with direct_vm.expect_revert('execution is locked: proposal is BLOCKED'):
        caveat.consume_approval(proposal_id)


def test_only_the_principal_may_reconfirm(caveat, active_mandate, submit, mock_evidence,
                                          direct_vm, agent, stranger):
    _, proposal_id = _reconfirm_case(caveat, active_mandate, submit, mock_evidence)
    for imposter in (agent, stranger):
        direct_vm.sender = imposter
        with direct_vm.expect_revert('only the principal may reconfirm'):
            caveat.reconfirm(proposal_id)


def test_reconfirmation_unlocks_execution_and_rebinds_the_commitment(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal
):
    mandate_id, proposal_id = _reconfirm_case(caveat, active_mandate, submit, mock_evidence)
    before = mandate_of(caveat, mandate_id)

    direct_vm.sender = principal
    caveat.reconfirm(proposal_id)

    after = mandate_of(caveat, mandate_id)
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'EXECUTE_APPROVED'
    assert record['reason_code'] == 'RECONFIRMED_BY_PRINCIPAL'
    assert record['reconfirmed_at'] > 0
    assert caveat.is_executable(proposal_id) is True
    assert after['reconfirm_count'] == before['reconfirm_count'] + 1
    assert after['commitment'] != before['commitment'], 'fresh authority means a fresh commitment'
    assert record['mandate_commitment'] == after['commitment']
    assert record['verdict'] == 'RECONFIRM', 'the original verdict stays on the receipt'


def test_principal_can_reject_instead(caveat, active_mandate, submit, mock_evidence,
                                      direct_vm, principal):
    _, proposal_id = _reconfirm_case(caveat, active_mandate, submit, mock_evidence)
    direct_vm.sender = principal
    caveat.reject(proposal_id)
    record = proposal_of(caveat, proposal_id)
    assert record['status'] == 'BLOCKED'
    assert record['reason_code'] == 'REJECTED_BY_PRINCIPAL'
    assert caveat.is_executable(proposal_id) is False


def test_execute_verdict_authorizes_a_single_execution(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    assert caveat.is_executable(proposal_id) is True

    direct_vm.sender = agent
    receipt = caveat.consume_approval(proposal_id)
    assert receipt.startswith('0x') and len(receipt) == 66

    record = proposal_of(caveat, proposal_id)
    assert record['approval_consumed'] is True
    assert record['consumed_at'] > 0
    assert record['executable'] is False
    assert caveat.is_executable(proposal_id) is False


def test_replayed_approval_is_rejected(caveat, active_mandate, submit, mock_evidence,
                                       direct_vm, agent):
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    direct_vm.sender = agent
    caveat.consume_approval(proposal_id)
    with direct_vm.expect_revert('approval already consumed'):
        caveat.consume_approval(proposal_id)


def test_a_stranger_cannot_consume_the_approval(caveat, active_mandate, submit, mock_evidence,
                                                direct_vm, stranger):
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    direct_vm.sender = stranger
    with direct_vm.expect_revert(
        'only the mandated agent or the principal may consume the approval'
    ):
        caveat.consume_approval(proposal_id)


def test_revoking_the_mandate_disables_a_granted_approval(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    mandate_id, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)
    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate is not ACTIVE'):
        caveat.consume_approval(proposal_id)


def test_expiry_disables_a_granted_approval(caveat, active_mandate, submit, mock_evidence,
                                            direct_vm, agent):
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    warp(direct_vm, '2026-11-02T00:00:00Z')
    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate has expired'):
        caveat.consume_approval(proposal_id)


def test_end_to_end_reconfirm_then_execute(caveat, active_mandate, submit, mock_evidence,
                                           direct_vm, principal, agent):
    """The full demo path: drift pauses execution, fresh approval releases it exactly once."""
    mandate_id, drifted = _reconfirm_case(caveat, active_mandate, submit, mock_evidence)
    assert caveat.is_executable(drifted) is False

    direct_vm.sender = principal
    caveat.reconfirm(drifted)
    assert caveat.is_executable(drifted) is True

    direct_vm.sender = agent
    caveat.consume_approval(drifted)
    assert caveat.is_executable(drifted) is False
    with direct_vm.expect_revert('approval already consumed'):
        caveat.consume_approval(drifted)
