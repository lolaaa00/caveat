"""
Item 3: evidence receipts identify what was evaluated.

Before this fix, the evidence digest bound only the proposal ID, URL, extracted claim,
and retrieval class — not the fetched page bytes, the question, or any excerpt. The
extractor even asked the model for a supporting quote and then discarded it. A claim
was trusted purely because the model said so, with nothing checking it against the
source it claimed to come from.

Now every LIVE claim carries a verbatim excerpt that must actually appear (normalized)
in the exact bounded content the model was shown, and a digest of that content is
computed independently of the model and bound into the receipt alongside the excerpt,
the question, and the retrieval class.
"""

import re

from conftest import CONFERENCE_URL, EVIDENCE_QUESTIONS, _as_wire_json, flight, proposal_of, schedule_page


def extraction_with_excerpt(claim: str, excerpt: str) -> str:
    return _as_wire_json({'claim': claim, 'excerpt': excerpt})


def _evaluate(caveat, submit, direct_vm, mandate_id: str, page_body: str, llm_response: str) -> str:
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    direct_vm.mock_web(re.escape(CONFERENCE_URL), {'body': page_body})
    direct_vm.mock_llm(r'extract one single fact', llm_response)
    caveat.evaluate_proposal(proposal_id)
    return proposal_id


def test_a_claim_whose_excerpt_is_not_in_the_source_is_discarded(
    caveat, active_mandate, submit, direct_vm
):
    """
    The model claims 08:00 and offers a supporting excerpt that never appears anywhere
    in the actual page — a hallucination, or a page-content injection trying to plant a
    false "supporting" quote. The claim must be discarded regardless of how plausible
    it reads, because the one objective check available — does the excerpt actually
    occur in the source — fails.
    """
    proposal_id = _evaluate(
        caveat,
        submit,
        direct_vm,
        active_mandate(),
        schedule_page('08:00'),
        extraction_with_excerpt('08:00', 'this text does not appear on the page anywhere'),
    )
    record = proposal_of(caveat, proposal_id)
    item = record['evidence'][0]
    assert item['retrieval_class'] == 'UNAVAILABLE'
    assert item['claim'] == 'NOT_FOUND'
    assert item['supported'] is False
    assert record['status'] == 'RECONFIRM_REQUIRED'
    assert record['reason_code'] == 'EVIDENCE_UNAVAILABLE'


def test_a_claim_with_no_excerpt_at_all_is_discarded(caveat, active_mandate, submit, direct_vm):
    """An empty excerpt can never satisfy the substring check, regardless of the claim."""
    proposal_id = _evaluate(
        caveat, submit, direct_vm, active_mandate(), schedule_page('08:00'), extraction_with_excerpt('08:00', '')
    )
    item = proposal_of(caveat, proposal_id)['evidence'][0]
    assert item['retrieval_class'] == 'UNAVAILABLE'
    assert item['supported'] is False


def test_a_verbatim_supported_excerpt_is_accepted_as_live(caveat, active_mandate, submit, direct_vm):
    """The positive case: an excerpt that is genuinely present is accepted, recorded, and
    carries a non-empty content digest."""
    proposal_id = _evaluate(
        caveat,
        submit,
        direct_vm,
        active_mandate(),
        schedule_page('08:00'),
        extraction_with_excerpt('08:00', '08:00  Opening session and keynote'),
    )
    item = proposal_of(caveat, proposal_id)['evidence'][0]
    assert item['retrieval_class'] == 'LIVE'
    assert item['supported'] is True
    assert item['claim'] == '08:00'
    assert item['excerpt'] == '08:00  Opening session and keynote'
    assert item['content_digest'].startswith('0x') and len(item['content_digest']) == 66


def test_normalization_tolerates_whitespace_and_case_but_not_absence(
    caveat, active_mandate, submit, direct_vm
):
    """
    The documented normalization rule collapses whitespace and folds case — an excerpt
    that differs only in spacing or letter case from the source still matches — but an
    excerpt that is genuinely absent still fails no matter how it's formatted.
    """
    proposal_id = _evaluate(
        caveat,
        submit,
        direct_vm,
        active_mandate(),
        schedule_page('08:00'),
        extraction_with_excerpt('08:00', '08:00   OPENING session AND keynote'),
    )
    item = proposal_of(caveat, proposal_id)['evidence'][0]
    assert item['retrieval_class'] == 'LIVE', 'whitespace/case differences must not defeat a real match'


def test_changed_page_content_changes_the_receipt(caveat, active_mandate, submit, direct_vm):
    """Two evaluations against genuinely different source content must not produce the
    same content digest — the digest is supposed to identify *what was evaluated*."""
    mandate_a = active_mandate()
    first = _evaluate(
        caveat,
        submit,
        direct_vm,
        mandate_a,
        schedule_page('08:00'),
        extraction_with_excerpt('08:00', '08:00  Opening session and keynote'),
    )
    direct_vm.clear_mocks()
    mandate_b = active_mandate()
    second = _evaluate(
        caveat,
        submit,
        direct_vm,
        mandate_b,
        schedule_page('09:15'),
        extraction_with_excerpt('09:15', '09:15  Opening session and keynote'),
    )

    first_item = proposal_of(caveat, first)['evidence'][0]
    second_item = proposal_of(caveat, second)['evidence'][0]
    assert first_item['content_digest'] != second_item['content_digest']
    assert proposal_of(caveat, first)['evidence_digest'] != proposal_of(caveat, second)['evidence_digest']


def test_identical_page_content_produces_an_identical_content_digest(
    caveat, active_mandate, submit, direct_vm
):
    """The converse of the previous test: the digest is a pure function of the bounded
    content, not of the proposal or any other incidental state."""
    mandate_a = active_mandate()
    first = _evaluate(
        caveat,
        submit,
        direct_vm,
        mandate_a,
        schedule_page('08:00'),
        extraction_with_excerpt('08:00', '08:00  Opening session and keynote'),
    )
    direct_vm.clear_mocks()
    mandate_b = active_mandate()
    second = _evaluate(
        caveat,
        submit,
        direct_vm,
        mandate_b,
        schedule_page('08:00'),
        extraction_with_excerpt('08:00', '08:00  Opening session and keynote'),
    )
    first_digest = proposal_of(caveat, first)['evidence'][0]['content_digest']
    second_digest = proposal_of(caveat, second)['evidence'][0]['content_digest']
    assert first_digest == second_digest


def test_malformed_extraction_result_fails_closed(caveat, active_mandate, submit, direct_vm):
    """A response that isn't the expected JSON shape at all (e.g. missing the claim
    field) must fail closed exactly like an absent claim — never crash, never default
    to trusting something unparseable."""
    proposal_id = _evaluate(
        caveat,
        submit,
        direct_vm,
        active_mandate(),
        schedule_page('08:00'),
        _as_wire_json({'unexpected': 'shape', 'no_claim_field': True}),
    )
    item = proposal_of(caveat, proposal_id)['evidence'][0]
    assert item['retrieval_class'] == 'UNAVAILABLE'


def test_consensus_machinery_failure_fails_closed_never_fabricates_a_claim(
    caveat, active_mandate, submit, direct_vm
):
    """
    No LLM mock is registered for the extraction prompt at all, so the underlying
    non-deterministic call raises inside `gl.eq_principle.prompt_comparative`. This
    stands in for what real multi-validator disagreement also surfaces as — an
    exception from the consensus machinery, not a returned value either side can trust.
    `evaluate_proposal` catches it broadly and falls back to CLAIM_NOT_FOUND, the same
    fail-closed path as a source that never answered at all.

    This is the closest this test suite can get to "validator disagreement does not
    commit an executable result" without a live multi-validator network: gltest's
    direct-mode mock layer does not implement the ExecPromptTemplate calls a real
    comparative-equivalence validator round trip would make, so an actual disagreeing
    validator cannot be simulated locally. What this proves is the fail-closed
    contract-side handling of that failure mode; genuine cross-validator disagreement
    is exercised only on the live network, and recorded as such in the completion
    report rather than claimed here.
    """
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    direct_vm.mock_web(re.escape(CONFERENCE_URL), {'body': schedule_page('08:00')})
    # Deliberately no matching LLM mock -> MockNotFoundError inside the leader call.

    assert caveat.evaluate_proposal(proposal_id) == 'RECONFIRM'
    record = proposal_of(caveat, proposal_id)
    assert record['reason_code'] == 'EVIDENCE_UNAVAILABLE'
    assert record['evidence'][0]['retrieval_class'] == 'UNAVAILABLE'
    assert record['executable'] is False


def test_a_claim_that_does_not_conform_to_its_answer_schema_is_still_accepted(
    caveat, active_mandate, submit, direct_vm
):
    """
    Documents a real, accepted limitation (see docs/threat-model.md, 'Excerpt/answer_schema
    conformance is not contract-enforced'): `_extract_claim`'s only objective check is that
    the excerpt genuinely appears (normalized) in the fetched content. It never validates
    the claim's *shape* against the evidence question's declared answer_schema. Here the
    question asks for 'HH:MM in 24-hour local time, or NOT_FOUND', but the mocked model
    returns a claim that is not a time at all — and because its excerpt is genuinely
    verbatim in the page, it is still accepted as LIVE, supported evidence. Mitigated by
    consensus over the shared content_digest (both validators must agree byte-for-byte on
    what was fetched), not by schema validation, which does not exist in this contract.
    """
    proposal_id = _evaluate(
        caveat,
        submit,
        direct_vm,
        active_mandate(),
        schedule_page('08:00'),
        extraction_with_excerpt(
            'sometime in the morning, roughly', 'Opening session and keynote (Main Hall)'
        ),
    )
    item = proposal_of(caveat, proposal_id)['evidence'][0]
    assert item['retrieval_class'] == 'LIVE', (
        'the claim does not match its own answer_schema (HH:MM) at all, yet is still '
        'accepted because the only enforced check is excerpt presence, not claim shape'
    )
    assert item['supported'] is True
    assert item['claim'] == 'sometime in the morning, roughly'


def test_evidence_digest_binds_question_and_source_not_only_the_claim(
    caveat, active_mandate, submit, direct_vm
):
    """
    Two evaluations with the same claim and excerpt but a different qid/question must
    still be told apart by the digest — the receipt is supposed to say what question
    was asked and of which source, not merely what answer came back.
    """
    mandate_a = active_mandate(
        evidence_questions=[{**EVIDENCE_QUESTIONS[0], 'qid': 'q_a', 'question': 'Question A?'}]
    )
    response = extraction_with_excerpt('08:00', '08:00  Opening session and keynote')
    first = _evaluate(caveat, submit, direct_vm, mandate_a, schedule_page('08:00'), response)

    direct_vm.clear_mocks()
    mandate_b = active_mandate(
        evidence_questions=[{**EVIDENCE_QUESTIONS[0], 'qid': 'q_b', 'question': 'Question B?'}]
    )
    second = _evaluate(caveat, submit, direct_vm, mandate_b, schedule_page('08:00'), response)

    assert proposal_of(caveat, first)['evidence_digest'] != proposal_of(caveat, second)['evidence_digest']
