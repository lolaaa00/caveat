"""
Settlement: the payment leg of the execution gate.

Money moves on a testnet, signed by the principal's own wallet, and the contract
records it only after verifying the transaction against a public RPC. The gate comes
first: no consumed approval, no settlement.
"""

import json
import re

from conftest import flight, proposal_of

SEPOLIA_RPC = r'ethereum-sepolia-rpc\.publicnode\.com'
SOLANA_RPC = r'api\.devnet\.solana\.com'

PAYEE_EVM = '0x9f2c4a1b7d3e5f6081a2b3c4d5e6f708192a3b4c'
PAYEE_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
TX_EVM = '0x' + 'ab' * 32
TX_SOL = '5' + 'K' * 60
AMOUNT_WEI = 10_000_000_000_000_000  # 0.01 SepoliaETH
AMOUNT_LAMPORTS = 25_000_000  # 0.025 devnet SOL


def evm_rpc_body(status='0x1', to=PAYEE_EVM, value=AMOUNT_WEI, block='0x4f1a2b'):
    """
    One merged JSON-RPC result. The contract reads the receipt and the transaction with
    two calls to the same endpoint, and the mock cannot vary by request body, so a
    single object stands in for both; each negative case perturbs one field.
    """
    result = None
    if status is not None:
        result = {
            'status': status,
            'blockNumber': block,
            'to': to,
            'value': hex(value) if value is not None else '0x0',
        }
    return json.dumps({'jsonrpc': '2.0', 'id': 1, 'result': result})


def solana_rpc_body(err=None, destination=PAYEE_SOL, lamports=AMOUNT_LAMPORTS, found=True):
    result = None
    if found:
        result = {
            'slot': 348812201,
            'meta': {'err': err, 'fee': 5000},
            'transaction': {
                'message': {
                    'instructions': [
                        {
                            'program': 'system',
                            'parsed': {
                                'type': 'transfer',
                                'info': {
                                    'source': 'BQWWFhzBdw2vKKBUX17NHeFbCoFQHfRARpdztPE2tDJ',
                                    'destination': destination,
                                    'lamports': lamports,
                                },
                            },
                        }
                    ]
                }
            },
        }
    return json.dumps({'jsonrpc': '2.0', 'id': 1, 'result': result})


def mock_rpc(direct_vm, pattern, body):
    direct_vm.mock_web(pattern, {'method': 'POST', 'status': 200, 'body': body})


def approved_and_consumed(caveat, active_mandate, submit, mock_evidence, direct_vm, agent):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='INTENT_SATISFIED')
    caveat.evaluate_proposal(proposal_id)
    direct_vm.sender = agent
    caveat.consume_approval(proposal_id)
    return proposal_id


# --- ordering -----------------------------------------------------------------------


def test_settlement_requires_a_consumed_approval(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='06:45'))
    mock_evidence(opening_time='08:00', verdict='EXECUTE', reason='OK')
    caveat.evaluate_proposal(proposal_id)

    direct_vm.sender = agent
    with direct_vm.expect_revert('settlement requires a consumed execution approval'):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


def test_a_paused_action_cannot_be_settled(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(arrival='10:30'))
    mock_evidence(opening_time='08:00', verdict='RECONFIRM', reason='TIMING')
    caveat.evaluate_proposal(proposal_id)

    direct_vm.sender = agent
    with direct_vm.expect_revert(
        'settlement requires an approved proposal, not RECONFIRM_REQUIRED'
    ):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


def test_a_blocked_action_cannot_be_settled(caveat, active_mandate, submit, direct_vm, agent):
    mandate_id = active_mandate()
    proposal_id = submit(mandate_id, flight(refundable=False))
    caveat.evaluate_proposal(proposal_id)
    direct_vm.sender = agent
    with direct_vm.expect_revert('settlement requires an approved proposal, not BLOCKED'):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


# --- sepolia ------------------------------------------------------------------------


def test_verified_sepolia_payment_is_recorded(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body())

    direct_vm.sender = agent
    recorded = json.loads(
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)
    )
    assert recorded['verified'] is True
    assert recorded['chain'] == 'sepolia'
    assert recorded['tx_hash'] == TX_EVM
    assert recorded['payee'] == PAYEE_EVM
    assert recorded['amount_minor'] == str(AMOUNT_WEI)
    assert 'block' in recorded['detail']

    stored = proposal_of(caveat, proposal_id)['settlement']
    assert stored['tx_hash'] == TX_EVM
    assert json.loads(caveat.settlement_of(proposal_id))['verified'] is True


def test_payment_to_a_different_address_is_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body(to='0x' + '11' * 20))
    direct_vm.sender = agent
    with direct_vm.expect_revert('settlement not verified: transaction paid a different address'):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)
    assert caveat.settlement_of(proposal_id) == ''


def test_underpayment_is_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body(value=AMOUNT_WEI - 1))
    direct_vm.sender = agent
    with direct_vm.expect_revert(
        'settlement not verified: transaction paid less than the stated amount'
    ):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


def test_a_reverted_transaction_is_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body(status='0x0'))
    direct_vm.sender = agent
    with direct_vm.expect_revert(
        'settlement not verified: transaction did not succeed on chain'
    ):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


def test_an_invented_transaction_hash_is_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body(status=None))
    direct_vm.sender = agent
    with direct_vm.expect_revert('settlement not verified: transaction not found on chain'):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


# --- solana devnet ------------------------------------------------------------------


def test_verified_solana_payment_is_recorded(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SOLANA_RPC, solana_rpc_body())
    direct_vm.sender = agent
    recorded = json.loads(
        caveat.record_settlement(
            proposal_id, 'solana-devnet', TX_SOL, PAYEE_SOL, AMOUNT_LAMPORTS
        )
    )
    assert recorded['verified'] is True
    assert recorded['chain'] == 'solana-devnet'
    assert recorded['payee'] == PAYEE_SOL
    assert recorded['amount_minor'] == str(AMOUNT_LAMPORTS)
    assert recorded['chain_ref'] == '348812201'


def test_a_failed_solana_transaction_is_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SOLANA_RPC, solana_rpc_body(err={'InstructionError': [0, 'Custom']}))
    direct_vm.sender = agent
    with direct_vm.expect_revert('settlement not verified: transaction failed on chain'):
        caveat.record_settlement(
            proposal_id, 'solana-devnet', TX_SOL, PAYEE_SOL, AMOUNT_LAMPORTS
        )


def test_a_solana_transfer_to_another_wallet_is_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SOLANA_RPC, solana_rpc_body(destination='9' + 'Z' * 43))
    direct_vm.sender = agent
    with direct_vm.expect_revert(
        'settlement not verified: no matching transfer to the stated payee'
    ):
        caveat.record_settlement(
            proposal_id, 'solana-devnet', TX_SOL, PAYEE_SOL, AMOUNT_LAMPORTS
        )


# --- guards -------------------------------------------------------------------------


def test_settlement_is_recorded_only_once(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body())
    direct_vm.sender = agent
    caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)
    with direct_vm.expect_revert('settlement already recorded'):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)


def test_mainnet_and_unknown_rails_are_refused(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    direct_vm.sender = agent
    for rail in ('ethereum', 'mainnet', 'solana', 'bitcoin'):
        with direct_vm.expect_revert('unsupported settlement chain'):
            caveat.record_settlement(proposal_id, rail, TX_EVM, PAYEE_EVM, AMOUNT_WEI)


def test_a_stranger_cannot_record_settlement(
    caveat, active_mandate, submit, mock_evidence, direct_vm, agent, stranger
):
    proposal_id = approved_and_consumed(
        caveat, active_mandate, submit, mock_evidence, direct_vm, agent
    )
    mock_rpc(direct_vm, SEPOLIA_RPC, evm_rpc_body())
    direct_vm.sender = stranger
    with direct_vm.expect_revert('only the mandated agent or the principal may record settlement'):
        caveat.record_settlement(proposal_id, 'sepolia', TX_EVM, PAYEE_EVM, AMOUNT_WEI)
