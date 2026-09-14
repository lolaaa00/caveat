"""Mandate lifecycle, permissions and policy immutability."""

import json

import pytest
from conftest import EXPIRY_EPOCH, NOW_EPOCH, INTENT, mandate_of, warp


def test_create_mandate_preserves_original_wording(caveat, make_mandate):
    mandate_id = make_mandate()
    record = mandate_of(caveat, mandate_id)
    assert record['intent_text'] == INTENT, 'the principal wording must never be rewritten'
    assert record['status'] == 'DRAFT'
    assert record['commitment'] == '', 'a draft has no frozen policy commitment yet'
    assert record['created_at'] == NOW_EPOCH
    assert record['expires_at'] == EXPIRY_EPOCH


def test_activation_freezes_a_policy_commitment(caveat, make_mandate, direct_vm, principal):
    mandate_id = make_mandate()
    direct_vm.sender = principal
    commitment = caveat.activate_mandate(mandate_id)
    record = mandate_of(caveat, mandate_id)
    assert record['status'] == 'ACTIVE'
    assert commitment.startswith('0x') and len(commitment) == 66
    assert record['commitment'] == commitment


def test_only_principal_may_activate(caveat, make_mandate, direct_vm, agent, stranger):
    mandate_id = make_mandate()
    for imposter in (agent, stranger):
        direct_vm.sender = imposter
        with direct_vm.expect_revert('only the principal may activate this mandate'):
            caveat.activate_mandate(mandate_id)


def test_only_principal_may_revoke(caveat, active_mandate, direct_vm, agent):
    mandate_id = active_mandate()
    direct_vm.sender = agent
    with direct_vm.expect_revert('only the principal may revoke this mandate'):
        caveat.revoke_mandate(mandate_id)


def test_revoke_closes_the_mandate(caveat, active_mandate, direct_vm, principal):
    mandate_id = active_mandate()
    direct_vm.sender = principal
    caveat.revoke_mandate(mandate_id)
    assert mandate_of(caveat, mandate_id)['status'] == 'REVOKED'
    with direct_vm.expect_revert('mandate is already closed'):
        caveat.revoke_mandate(mandate_id)


def test_cannot_activate_twice(caveat, active_mandate, direct_vm, principal):
    mandate_id = active_mandate()
    direct_vm.sender = principal
    with direct_vm.expect_revert('only a DRAFT mandate can be activated'):
        caveat.activate_mandate(mandate_id)


def test_expiry_must_be_in_the_future(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('expires_at must be in the future'):
        make_mandate(expires_at=NOW_EPOCH - 1)


def test_intent_text_is_required(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('intent_text is required'):
        make_mandate(intent_text='   ')


def test_evidence_source_must_be_an_approved_source(caveat, make_mandate, direct_vm):
    rogue = [
        {
            'qid': 'q1',
            'question': 'When does it open?',
            'source_url': 'https://agent-controlled.example/claims.json',
            'answer_schema': 'HH:MM',
        }
    ]
    with direct_vm.expect_revert('evidence source_url must be an approved source'):
        make_mandate(evidence_questions=rogue)


def test_approved_sources_must_be_https(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('approved sources must be absolute HTTPS URLs'):
        make_mandate(approved_sources=['http://insecure.example/schedule'], evidence_questions=[])


def test_unsupported_constraint_operator_is_rejected(caveat, make_mandate, direct_vm):
    bad = [{'label': 'Budget', 'field': 'price_eur', 'op': 'roughly_under', 'value': 900}]
    with direct_vm.expect_revert('unsupported constraint operator'):
        make_mandate(hard_constraints=bad)


def test_activation_is_blocked_once_the_mandate_has_expired(
    caveat, make_mandate, direct_vm, principal
):
    mandate_id = make_mandate()
    warp(direct_vm, '2026-11-02T00:00:00Z')
    direct_vm.sender = principal
    with direct_vm.expect_revert('mandate has already expired'):
        caveat.activate_mandate(mandate_id)


def test_unknown_mandate_reverts(caveat, direct_vm, principal):
    direct_vm.sender = principal
    with direct_vm.expect_revert('unknown mandate'):
        caveat.activate_mandate('MND-9999')


def test_mandate_index_lists_created_mandates(caveat, make_mandate):
    first = make_mandate()
    second = make_mandate()
    assert json.loads(caveat.list_mandates()) == [first, second]
    assert first != second
