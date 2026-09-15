"""
The one-time execution gate and the reconfirmation flow.

Only EXECUTE unlocks execution, the approval is consumable exactly once, and a
paused action stays locked until the principal personally re-authorizes it.

The central invariant: is_executable() and get_proposal().executable must agree with
consume_approval(). When either read gate returns False, consume_approval() must raise;
when it returns True, consume_approval() must succeed (assuming no concurrent write).
This is enforced by the shared _executable_gate predicate.
"""

import ast

from conftest import CONTRACT_PATH, flight, mandate_of, proposal_of, warp


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


# ---- Gate-parity tests: is_executable / get_proposal.executable / consume_approval ----
# These tests prove that the three surfaces agree. Before _executable_gate was
# introduced, is_executable() and get_proposal().executable did not check mandate status
# or expiry, so they could report True while consume_approval() raised.


def test_is_executable_returns_false_for_revoked_mandate(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """is_executable() must follow the mandate status, not only the proposal status."""
    mandate_id, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    assert caveat.is_executable(proposal_id) is True

    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)

    assert caveat.is_executable(proposal_id) is False, (
        'is_executable must return False after revocation — before the shared predicate '
        'it returned True here, diverging from consume_approval which correctly raised'
    )


def test_is_executable_returns_false_for_expired_mandate(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """is_executable() must follow the mandate expiry, not only the proposal status."""
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    assert caveat.is_executable(proposal_id) is True

    warp(direct_vm, '2026-11-02T00:00:00Z')

    assert caveat.is_executable(proposal_id) is False, (
        'is_executable must return False after expiry — before the shared predicate '
        'it returned True here, diverging from consume_approval which correctly raised'
    )


def test_get_proposal_executable_returns_false_for_revoked_mandate(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal
):
    """get_proposal().executable must agree with is_executable() on revocation."""
    mandate_id, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    assert proposal_of(caveat, proposal_id)['executable'] is True

    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)

    assert proposal_of(caveat, proposal_id)['executable'] is False


def test_get_proposal_executable_returns_false_for_expired_mandate(
    caveat, active_mandate, submit, mock_evidence, direct_vm
):
    """get_proposal().executable must agree with is_executable() on expiry."""
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    assert proposal_of(caveat, proposal_id)['executable'] is True

    warp(direct_vm, '2026-11-02T00:00:00Z')

    assert proposal_of(caveat, proposal_id)['executable'] is False


def test_gate_surfaces_all_agree_after_revocation(
    caveat, active_mandate, submit, mock_evidence, direct_vm, principal, agent
):
    """
    All three surfaces (is_executable, get_proposal.executable, consume_approval) must
    give the same answer for the same state. After revocation:
      - is_executable() -> False
      - get_proposal().executable -> False
      - consume_approval() -> raises 'mandate is not ACTIVE'
    """
    mandate_id, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)

    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)

    assert caveat.is_executable(proposal_id) is False
    assert proposal_of(caveat, proposal_id)['executable'] is False
    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate is not ACTIVE'):
        caveat.consume_approval(proposal_id)


def test_gate_surfaces_all_agree_after_expiry(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """All three surfaces agree after expiry."""
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    warp(direct_vm, '2026-11-02T00:00:00Z')

    assert caveat.is_executable(proposal_id) is False
    assert proposal_of(caveat, proposal_id)['executable'] is False
    direct_vm.sender = agent
    with direct_vm.expect_revert('mandate has expired'):
        caveat.consume_approval(proposal_id)


def test_read_only_executable_result_cannot_authorize_without_consuming(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    """
    A downstream consumer that reads is_executable() == True and then acts without
    calling consume_approval() receives no authorization artifact. This documents and
    tests the contract's design: the readable state is a hint for display, not the
    authorization itself. Only consume_approval() produces the artifact that a
    settlement rail may bind to, and it's one-time.
    """
    _, proposal_id = _execute_case(caveat, active_mandate, submit, mock_evidence)
    assert caveat.is_executable(proposal_id) is True

    # A read-only check of executable state — this produces no artifact.
    record = proposal_of(caveat, proposal_id)
    assert record['executable'] is True
    assert record['approval_consumed'] is False
    # authorization_artifact is empty until consume_approval is called.
    assert caveat.authorization_artifact(proposal_id) == '', (
        'reading executable state does not produce an artifact; '
        'consume_approval must be called to obtain authorization'
    )

    # Only after consuming does the artifact appear.
    direct_vm.sender = agent
    artifact = caveat.consume_approval(proposal_id)
    assert artifact.startswith('0x')
    assert caveat.authorization_artifact(proposal_id) == artifact
    assert caveat.is_executable(proposal_id) is False


def test_consume_approval_literally_calls_the_shared_gate_predicate():
    """
    The behavioral gate-parity tests above prove is_executable(), get_proposal().executable
    and consume_approval() currently *agree*. Agreement alone doesn't prove they can't
    diverge again — two independently written checks can agree today and drift apart on a
    future edit to only one of them, which is exactly the bug this contract once had
    (is_executable() didn't check mandate status/expiry while consume_approval() did).

    This test inspects the actual source of consume_approval() and asserts its body
    contains a call to `self._executable_gate(...)` — the same method is_executable() and
    get_proposal() call. It is a static, environment-independent way to enforce literal
    sharing of one predicate, rather than relying on runtime monkeypatching inside GenVM's
    sandboxed direct-execution VM (whose patchability isn't guaranteed).
    """
    tree = ast.parse(CONTRACT_PATH.read_text())
    class_def = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef) and node.name == 'Caveat'
    )
    consume_approval = next(
        node for node in class_def.body
        if isinstance(node, ast.FunctionDef) and node.name == 'consume_approval'
    )

    def calls_executable_gate(node) -> bool:
        for call in ast.walk(node):
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == '_executable_gate'
                and isinstance(call.func.value, ast.Name)
                and call.func.value.id == 'self'
            ):
                return True
        return False

    assert calls_executable_gate(consume_approval), (
        'consume_approval() must call self._executable_gate(...) directly — reimplementing '
        'the same conditions inline (even if currently equivalent) is exactly the pattern '
        'that let is_executable() and consume_approval() silently diverge before'
    )
