"""
Item 5: hardened inputs and commitments.

- Every text/count field a principal or agent controls has an explicit size limit.
- Numeric constraint comparisons use exact decimal arithmetic, never binary float,
  so a boundary value like 900.10 cannot be misjudged by float rounding.
- Every digest hashes a canonical structured encoding, not a delimiter-joined string —
  so two different sets of field values can never collide into the same commitment
  just because one field happened to contain the old separator character.
"""

import json

import pytest

from conftest import (
    CONFERENCE_URL,
    EVIDENCE_QUESTIONS,
    EXPIRY_EPOCH,
    HARD_CONSTRAINTS,
    INTENT,
    JUDGEMENT_PROMPT_PATTERN,
    PURPOSE,
    RECONFIRM_POLICY,
    SEMANTIC_CONDITION,
    flight,
    judgement_response,
    mandate_of,
    proposal_of,
)


# --- oversized inputs -----------------------------------------------------------------


def test_oversized_intent_text_is_rejected(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('intent_text is too long'):
        make_mandate(intent_text='x' * 2001)


def test_oversized_purpose_text_is_rejected(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('purpose_text is too long'):
        make_mandate(purpose_text='x' * 2001)


def test_oversized_semantic_conditions_is_rejected(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('semantic_conditions is too long'):
        make_mandate(semantic_conditions='x' * 2001)


def test_oversized_reconfirm_policy_is_rejected(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('reconfirm_policy is too long'):
        make_mandate(reconfirm_policy='x' * 2001)


def test_oversized_action_type_is_rejected(caveat, make_mandate, direct_vm):
    with direct_vm.expect_revert('action_type is too long'):
        make_mandate(action_type='x' * 201)


def test_too_many_hard_constraints_is_rejected(caveat, make_mandate, direct_vm):
    constraints = [{'label': 'C', 'field': 'x', 'op': 'eq', 'value': 1} for _ in range(11)]
    with direct_vm.expect_revert('too many hard constraints'):
        make_mandate(hard_constraints=constraints)


def test_oversized_constraint_field_path_is_rejected(caveat, make_mandate, direct_vm):
    constraints = [{'label': 'C', 'field': 'x' * 121, 'op': 'eq', 'value': 1}]
    with direct_vm.expect_revert('hard constraint field path is too long'):
        make_mandate(hard_constraints=constraints)


def test_too_many_approved_sources_is_rejected(caveat, make_mandate, direct_vm):
    sources = [f'https://example{i}.com/' for i in range(6)]
    with direct_vm.expect_revert('too many approved sources'):
        make_mandate(approved_sources=sources, evidence_questions=[])


def test_oversized_source_url_is_rejected(caveat, make_mandate, direct_vm):
    huge_url = 'https://example.com/' + 'x' * 500
    with direct_vm.expect_revert('approved source URL is too long'):
        make_mandate(approved_sources=[huge_url], evidence_questions=[])


def test_oversized_evidence_question_text_is_rejected(caveat, make_mandate, direct_vm):
    questions = [{**EVIDENCE_QUESTIONS[0], 'question': 'x' * 501}]
    with direct_vm.expect_revert('evidence question text is too long'):
        make_mandate(evidence_questions=questions)


def test_oversized_fallback_claim_is_rejected(caveat, make_mandate, direct_vm):
    questions = [{**EVIDENCE_QUESTIONS[0], 'fallback_claim': 'x' * 201}]
    with direct_vm.expect_revert('evidence fallback_claim is too long'):
        make_mandate(evidence_questions=questions)


def test_oversized_action_summary_is_rejected(caveat, active_mandate, direct_vm, agent):
    mandate_id = active_mandate()
    direct_vm.sender = agent
    with direct_vm.expect_revert('action_summary is too long'):
        caveat.submit_proposal(mandate_id, json.dumps(flight()), 'x' * 501)


def test_oversized_action_payload_is_rejected(caveat, active_mandate, direct_vm, agent):
    mandate_id = active_mandate()
    payload = flight()
    payload['padding'] = 'x' * 4000
    direct_vm.sender = agent
    with direct_vm.expect_revert('action_payload_json is too long'):
        caveat.submit_proposal(mandate_id, json.dumps(payload), 'summary')


# --- within-bounds inputs still work ---------------------------------------------------


def test_inputs_at_exactly_the_limit_are_accepted(caveat, make_mandate, direct_vm, principal):
    mandate_id = make_mandate(intent_text='x' * 2000, action_type='y' * 200)
    direct_vm.sender = principal
    commitment = caveat.activate_mandate(mandate_id)
    assert commitment.startswith('0x')


# --- exact decimal arithmetic ----------------------------------------------------------


def test_decimal_boundary_is_judged_exactly_not_by_float_rounding(
    caveat, active_mandate, submit, direct_vm
):
    """
    900.10 is not exactly representable as a binary float; a naive float(str) round
    trip can misjudge whether it is <= 900.10. Using Decimal throughout means a budget
    of exactly the stated ceiling passes, and one cent over fails, with no ambiguity.
    """
    mandate_id = active_mandate(
        hard_constraints=[{'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': 900.10}]
    )
    at_limit = submit(mandate_id, flight(price_eur=900.10))
    caveat.evaluate_proposal(at_limit)
    assert proposal_of(caveat, at_limit)['deterministic_checks'][4]['passed'] is True

    mandate_id_2 = active_mandate(
        hard_constraints=[{'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': 900.10}]
    )
    over_limit = submit(mandate_id_2, flight(price_eur=900.11))
    caveat.evaluate_proposal(over_limit)
    record = proposal_of(caveat, over_limit)
    assert record['verdict'] == 'BLOCK'
    assert record['material_changed_fact'] == 'Budget'


def test_string_encoded_numeric_constraint_values_compare_exactly(
    caveat, active_mandate, submit, direct_vm
):
    """A constraint value supplied as a JSON string (e.g. "900.10") must compare exactly
    the same way as the equivalent numeric literal — Decimal parses both identically."""
    mandate_id = active_mandate(
        hard_constraints=[{'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': '900.10'}]
    )
    proposal_id = submit(mandate_id, flight(price_eur=900.10))
    caveat.evaluate_proposal(proposal_id)
    assert proposal_of(caveat, proposal_id)['deterministic_checks'][4]['passed'] is True


def test_non_numeric_constraint_value_fails_the_check_not_the_contract(
    caveat, active_mandate, submit, direct_vm
):
    """A malformed numeric constraint value degrades to a failed check, never a crash."""
    mandate_id = active_mandate(
        hard_constraints=[{'label': 'Budget', 'field': 'price_eur', 'op': 'lte', 'value': 'not-a-number'}]
    )
    proposal_id = submit(mandate_id, flight(price_eur=100))
    caveat.evaluate_proposal(proposal_id)
    check = proposal_of(caveat, proposal_id)['deterministic_checks'][4]
    assert check['passed'] is False
    assert check['detail'] == 'non-numeric value for numeric comparison'


# --- unambiguous canonical hashing -----------------------------------------------------


def test_commitment_does_not_collide_when_a_field_contains_the_old_separator_char(
    caveat, make_mandate, direct_vm, principal
):
    """
    Regression for the specific ambiguity a delimiter-joined hash has: two different
    (intent_text, purpose_text) pairs that would concatenate to the identical joined
    string under a naive "\\x1f".join() must still hash to *different* commitments once
    boundaries are canonical-JSON-encoded rather than delimiter-joined.
    """
    mandate_a = make_mandate(intent_text='A\x1fB', purpose_text='C')
    mandate_b = make_mandate(intent_text='A', purpose_text='B\x1fC')

    direct_vm.sender = principal
    commitment_a = caveat.activate_mandate(mandate_a)
    commitment_b = caveat.activate_mandate(mandate_b)

    assert commitment_a != commitment_b, (
        'a delimiter-joined hash could make these two different mandates collide; '
        'canonical JSON encoding must not'
    )


def test_evidence_digest_does_not_collide_when_a_field_contains_the_old_delimiter(
    caveat, active_mandate, submit, direct_vm
):
    """The same collision regression, for the evidence digest's old '|' delimiter."""
    import re

    from conftest import extraction_response, schedule_page

    mandate_a = active_mandate()
    proposal_a = submit(mandate_a, flight(arrival='06:45'))
    direct_vm.mock_web(re.escape(CONFERENCE_URL), {'body': schedule_page('08:00')})
    direct_vm.mock_llm(r'extract one single fact', extraction_response('A|B'))
    caveat.evaluate_proposal(proposal_a)

    direct_vm.clear_mocks()
    mandate_b = active_mandate()
    proposal_b = submit(mandate_b, flight(arrival='06:45'))
    direct_vm.mock_web(re.escape(CONFERENCE_URL), {'body': schedule_page('08:00')})
    direct_vm.mock_llm(r'extract one single fact', extraction_response('A', excerpt='B  Opening session and keynote'))
    # This second claim ('A') will not be supported by the page (excerpt doesn't match
    # claim's own context), which is fine — the point is only that the two evidence
    # digests must differ, not that both are LIVE.
    caveat.evaluate_proposal(proposal_b)

    assert proposal_of(caveat, proposal_a)['evidence_digest'] != proposal_of(caveat, proposal_b)['evidence_digest']


# ---- URL validation tests -----------------------------------------------------------

def _make_mandate_with_sources(make_mandate, direct_vm, sources, questions=None):
    """Helper: attempt to create a mandate with custom sources/questions."""
    import json
    if questions is None:
        questions = [
            {
                'qid': 'q1',
                'question': 'What is the opening time?',
                'source_url': sources[0] if sources else '',
                'answer_schema': 'HH:MM',
                'fallback_claim': '',
            }
        ] if sources else []
    return make_mandate(approved_sources=sources, evidence_questions=questions)


@pytest.mark.parametrize('bad_url', [
    'http://example.com/schedule',             # not https
    'ftp://example.com/schedule',              # wrong scheme
    'data:text/plain,hello',                   # data URI
    '/relative/path',                          # relative path
    'example.com/no-scheme',                   # no scheme
    'https://user:pass@example.com/path',      # credentials in URL
    'https://localhost/schedule',              # loopback
    'https://127.0.0.1/schedule',             # loopback IP
    'https://10.0.0.1/schedule',              # private range
    'https://192.168.1.1/schedule',           # private range
    'https://172.16.0.1/schedule',            # private range (172.16–31)
    'https://0.0.0.0/schedule',               # reserved
    'https://[::1]/schedule',                 # IPv6 loopback
    'https://example.com/page#section',       # fragment
])
def test_unsafe_source_url_is_rejected(make_mandate, direct_vm, bad_url):
    """create_mandate must reject URLs that are not safe absolute HTTPS destinations."""
    with pytest.raises(Exception, match='approved source'):
        _make_mandate_with_sources(make_mandate, direct_vm, [bad_url])


def test_valid_https_url_is_accepted(make_mandate, direct_vm):
    """A well-formed public HTTPS URL is accepted."""
    _make_mandate_with_sources(
        make_mandate, direct_vm, [CONFERENCE_URL]
    )


def test_sources_and_questions_must_be_consistent(make_mandate, direct_vm):
    """Sources with no questions (or questions with no sources) is incoherent."""
    with pytest.raises(Exception, match='non-empty but evidence_questions is empty'):
        make_mandate(
            approved_sources=[CONFERENCE_URL],
            evidence_questions=[],
        )
    # questions with no sources: the source_url validation fires first since the
    # question's source_url is not in the empty sources list
    with pytest.raises(Exception, match='evidence source_url must be an approved source|non-empty but approved_sources is empty'):
        make_mandate(
            approved_sources=[],
            evidence_questions=[EVIDENCE_QUESTIONS[0]],
        )


def test_pure_constraint_mandate_with_no_sources_or_questions_is_valid(make_mandate, direct_vm):
    """
    A mandate with no approved sources and no evidence questions is a legitimate
    'pure constraint + semantic' mode. The model receives an empty evidence list and
    evaluates purely against the mandate text and proposed action. This is documented
    behavior, not an accidental bypass: a principal who creates such a mandate is
    explicitly saying 'no live evidence needed, only the hard constraints and the
    semantic conditions I've stated matter.'
    """
    _make_mandate_with_sources(make_mandate, direct_vm, sources=[], questions=[])


def test_no_evidence_mandate_reaches_execute_via_constraints_and_judgement_alone(
    active_mandate, submit, caveat, direct_vm
):
    """
    The mandate-creation test above only proves a pure-constraint mandate is *valid to
    create*. This proves it all the way through evaluation: with zero evidence questions,
    evaluate_proposal never fetches anything or calls extraction — it runs deterministic
    hard constraints, then semantic judgement against the mandate text and proposed action
    alone, and can still reach EXECUTE. The empty evidence list is real, not a hidden
    default that silently disables the checkpoint.
    """
    mandate_id = active_mandate(approved_sources=[], evidence_questions=[])
    proposal_id = submit(mandate_id, flight(arrival='06:45'))

    direct_vm.mock_llm(
        JUDGEMENT_PROMPT_PATTERN, judgement_response('EXECUTE', 'INTENT_SATISFIED')
    )
    verdict = caveat.evaluate_proposal(proposal_id)

    assert verdict == 'EXECUTE'
    record = proposal_of(caveat, proposal_id)
    assert record['evidence'] == []
    assert record['status'] == 'EXECUTE_APPROVED'


def test_no_evidence_mandate_with_time_sensitive_conditions_is_not_auto_protected(
    active_mandate, submit, caveat, direct_vm
):
    """
    Documents a real, accepted limitation (see docs/threat-model.md, 'No-evidence
    (pure-constraint) mandates'): the contract cannot tell whether semantic_conditions
    genuinely depend on an external, checkable fact. A principal who writes a time- or
    fact-sensitive condition but configures no evidence policy gets no automatic
    protection — judgement runs against the mandate text and proposed action alone, with
    nothing external to check it against. This is not a silent bypass to a fixed verdict
    (the model still decides, per-case), but it is not a substitute for the evidence
    policy either. Evidence selection is the principal's responsibility.
    """
    mandate_id = active_mandate(
        approved_sources=[],
        evidence_questions=[],
        semantic_conditions='Only proceed if the conference venue has not changed.',
    )
    proposal_id = submit(mandate_id, flight(arrival='06:45'))

    direct_vm.mock_llm(
        JUDGEMENT_PROMPT_PATTERN, judgement_response('EXECUTE', 'INTENT_SATISFIED')
    )
    verdict = caveat.evaluate_proposal(proposal_id)

    assert verdict == 'EXECUTE', (
        'documents current behavior: with no evidence configured, judgement runs on '
        'mandate text alone and can reach EXECUTE even for a fact-sensitive condition — '
        'evidence policy is the principal\'s responsibility, not enforced by the contract'
    )
