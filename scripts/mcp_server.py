"""
MCP server exposing the deployed CAVEAT contract to any MCP-compatible agent.

    claude mcp add caveat \
      --env CAVEAT_AGENT_PRIVATE_KEY=0x... \
      --env CAVEAT_PRINCIPAL_PRIVATE_KEY=0x... \
      -- python3 scripts/mcp_server.py

This is not a backend: there is no listening port, no process to host, and no state
this server owns. It is a local stdio process, started by the agent's own MCP client,
that turns the 15 methods on contracts/caveat.py into MCP tools by calling
genlayer-py's read_contract/write_contract directly against the address in .env —
the exact same client library and contract-call pattern scripts/e2e.py already uses.
When you stop the process, nothing is lost: every fact it exposes lives on chain.

Deliberately implements the MCP stdio JSON-RPC protocol by hand (newline-delimited
JSON-RPC 2.0 over stdin/stdout: initialize, notifications/initialized, tools/list,
tools/call) instead of depending on the official `mcp` package, whose dependency
chain pulls in a from-source Rust build of `cryptography` with no prebuilt wheel on
some platforms — a slow, fragile install for a project that otherwise needs nothing
beyond the RC toolchain already pinned in BUILD_DECISIONS.md. The protocol surface
used here is small and stable enough that hand-rolling it is the safer choice.

Read tools need no key (contract reads are free). Write tools need whichever of
CAVEAT_PRINCIPAL_PRIVATE_KEY / CAVEAT_AGENT_PRIVATE_KEY the action requires, matching
who the contract itself allows to call it (see contracts/caveat.py's own sender
checks) — a tool call with no matching key configured returns a clear tool error
instead of crashing the server or silently using the wrong identity.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Callable

from genlayer_py import create_account, generate_private_key

from studio import (
    read_env,
    require_success,
    studio_client,
    tx_fees,
    _hex,
)

PROTOCOL_VERSION = '2024-11-05'
SERVER_INFO = {'name': 'caveat', 'version': '1.0.0'}

# ---------------------------------------------------------------------------------
# Contract wiring — reuses the exact client/call pattern scripts/e2e.py already
# proved live on chain, not a new integration path.
# ---------------------------------------------------------------------------------


def _env() -> dict[str, str]:
    import os

    merged = read_env()
    merged.update({k: v for k, v in os.environ.items() if v})
    return merged


def _contract_address() -> str:
    address = _env().get('NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS', '').strip()
    if not address:
        raise RuntimeError(
            'no contract address configured. Set NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS '
            'in .env, or deploy first with `npm run deploy`.'
        )
    return address


_read_account = None  # lazily created, process-lifetime only


def _read_client():
    """
    genlayer-py's read_contract requires a `from` sender address even though a read
    costs no gas and needs no funding — it's the identity a simulated call runs as,
    not a signer. Reads should never require configuring a real key, so this reuses
    (or lazily generates) one throwaway, unfunded, worthless keypair per server
    process purely to satisfy that requirement.
    """
    global _read_account
    if _read_account is None:
        env = _env()
        for key_name in ('CAVEAT_AGENT_PRIVATE_KEY', 'CAVEAT_PRINCIPAL_PRIVATE_KEY'):
            key = env.get(key_name, '').strip()
            if key:
                _read_account = create_account(account_private_key=key)
                break
        else:
            _read_account = create_account(account_private_key=generate_private_key())
    return studio_client(account=_read_account)


def _account_for(role: str):
    key_name = 'CAVEAT_PRINCIPAL_PRIVATE_KEY' if role == 'principal' else 'CAVEAT_AGENT_PRIVATE_KEY'
    key = _env().get(key_name, '').strip()
    if not key:
        raise RuntimeError(
            f'{key_name} is not set. This action must be signed by the mandate\'s '
            f'{role}; configure that key (e.g. via `claude mcp add ... --env {key_name}=0x...`) '
            'to call it from here.'
        )
    return create_account(account_private_key=key)


def read_call(function_name: str, args: list) -> Any:
    return _read_client().read_contract(
        address=_contract_address(), function_name=function_name, args=args
    )


def write_call(role: str, function_name: str, args: list) -> dict:
    account = _account_for(role)
    client = studio_client(account=account)
    fees = tx_fees(client)
    tx_hash = client.write_contract(
        address=_contract_address(),
        function_name=function_name,
        args=args,
        account=account,
        fees=fees,
    )
    receipt = require_success(client, tx_hash, function_name)
    return {'tx_hash': _hex(tx_hash), 'receipt': _returned_value(receipt)}


def _returned_value(receipt) -> Any:
    consensus = receipt.get('consensus_data') or {}
    leader = consensus.get('leader_receipt')
    if isinstance(leader, dict):
        leader = [leader]
    if isinstance(leader, list) and leader:
        for key in ('result', 'returned', 'return_value'):
            if key in leader[0]:
                return leader[0][key]
    return None


# ---------------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------------

_STR = {'type': 'string'}
_INT = {'type': 'integer'}


def _schema(required: dict[str, dict], optional: dict[str, dict] | None = None) -> dict:
    props = {**required, **(optional or {})}
    return {'type': 'object', 'properties': props, 'required': list(required.keys())}


TOOLS: list[dict] = [
    # ---- reads: no key required -------------------------------------------------
    {
        'name': 'get_mandate',
        'description': 'Read a mandate\'s full policy and status by id.',
        'inputSchema': _schema({'mandate_id': _STR}),
        'handler': lambda a: read_call('get_mandate', [a['mandate_id']]),
    },
    {
        'name': 'get_proposal',
        'description': (
            'Read a proposal\'s deterministic checks, evidence, verdict and execution '
            'gate state by id.'
        ),
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: read_call('get_proposal', [a['proposal_id']]),
    },
    {
        'name': 'is_executable',
        'description': (
            'Whether a proposal\'s approval can be consumed right now. A read-only '
            'hint, not an authorization by itself — only consume_approval spends it.'
        ),
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: read_call('is_executable', [a['proposal_id']]),
    },
    {
        'name': 'list_mandates',
        'description': 'List all mandate ids ever created on this contract.',
        'inputSchema': _schema({}),
        'handler': lambda a: read_call('list_mandates', []),
    },
    {
        'name': 'list_proposals',
        'description': 'List all proposal ids ever submitted on this contract.',
        'inputSchema': _schema({}),
        'handler': lambda a: read_call('list_proposals', []),
    },
    {
        'name': 'proposals_for_mandate',
        'description': 'List the proposal ids submitted against one mandate.',
        'inputSchema': _schema({'mandate_id': _STR}),
        'handler': lambda a: read_call('proposals_for_mandate', [a['mandate_id']]),
    },
    {
        'name': 'authorization_artifact',
        'description': (
            'Recompute the authorization artifact for a proposal whose approval has '
            'already been consumed. Returns empty string if not yet consumed.'
        ),
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: read_call('authorization_artifact', [a['proposal_id']]),
    },
    # ---- writes: principal key required ------------------------------------------
    {
        'name': 'create_mandate',
        'description': (
            'Create a DRAFT mandate as the principal. hard_constraints_json, '
            'approved_sources_json and evidence_questions_json are JSON-encoded arrays '
            '(pass as JSON strings). Requires CAVEAT_PRINCIPAL_PRIVATE_KEY.'
        ),
        'inputSchema': _schema({
            'agent': _STR,
            'intent_text': _STR,
            'purpose_text': _STR,
            'action_type': _STR,
            'hard_constraints_json': _STR,
            'semantic_conditions': _STR,
            'approved_sources_json': _STR,
            'evidence_questions_json': _STR,
            'reconfirm_policy': _STR,
            'expires_at': _INT,
        }),
        'handler': lambda a: write_call('principal', 'create_mandate', [
            a['agent'], a['intent_text'], a['purpose_text'], a['action_type'],
            a['hard_constraints_json'], a['semantic_conditions'],
            a['approved_sources_json'], a['evidence_questions_json'],
            a['reconfirm_policy'], a['expires_at'],
        ]),
    },
    {
        'name': 'activate_mandate',
        'description': 'Freeze a DRAFT mandate\'s policy and make it usable. Principal only.',
        'inputSchema': _schema({'mandate_id': _STR}),
        'handler': lambda a: write_call('principal', 'activate_mandate', [a['mandate_id']]),
    },
    {
        'name': 'revoke_mandate',
        'description': 'Permanently close an ACTIVE mandate. Principal only.',
        'inputSchema': _schema({'mandate_id': _STR}),
        'handler': lambda a: write_call('principal', 'revoke_mandate', [a['mandate_id']]),
    },
    {
        'name': 'reconfirm',
        'description': (
            'Principal supplies fresh authorization for a proposal paused at '
            'RECONFIRM_REQUIRED, unlocking execution.'
        ),
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: write_call('principal', 'reconfirm', [a['proposal_id']]),
    },
    {
        'name': 'reject',
        'description': 'Principal refuses a proposal paused at RECONFIRM_REQUIRED.',
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: write_call('principal', 'reject', [a['proposal_id']]),
    },
    # ---- writes: agent key required ----------------------------------------------
    {
        'name': 'submit_proposal',
        'description': (
            'Submit a proposed action against an ACTIVE mandate. action_payload_json '
            'is a JSON-encoded object. Requires CAVEAT_AGENT_PRIVATE_KEY.'
        ),
        'inputSchema': _schema({
            'mandate_id': _STR, 'action_payload_json': _STR, 'action_summary': _STR,
        }),
        'handler': lambda a: write_call('agent', 'submit_proposal', [
            a['mandate_id'], a['action_payload_json'], a['action_summary'],
        ]),
    },
    {
        'name': 'evaluate_proposal',
        'description': (
            'Run the checkpoint: deterministic checks, then (if they pass) evidence '
            'retrieval and semantic judgement under consensus. Returns the verdict.'
        ),
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: write_call('agent', 'evaluate_proposal', [a['proposal_id']]),
    },
    # ---- write: either role may call ----------------------------------------------
    {
        'name': 'consume_approval',
        'description': (
            'Spend a single-use EXECUTE approval and return the authorization artifact. '
            'Callable by either the mandated agent or the principal — tries '
            'CAVEAT_AGENT_PRIVATE_KEY first, falls back to CAVEAT_PRINCIPAL_PRIVATE_KEY.'
        ),
        'inputSchema': _schema({'proposal_id': _STR}),
        'handler': lambda a: _consume_approval(a['proposal_id']),
    },
]

_TOOLS_BY_NAME = {tool['name']: tool for tool in TOOLS}


def _consume_approval(proposal_id: str) -> dict:
    try:
        return write_call('agent', 'consume_approval', [proposal_id])
    except RuntimeError as exc:
        if 'CAVEAT_AGENT_PRIVATE_KEY is not set' not in str(exc):
            raise
        return write_call('principal', 'consume_approval', [proposal_id])


# ---------------------------------------------------------------------------------
# MCP stdio JSON-RPC transport
# ---------------------------------------------------------------------------------


def _send(message: dict) -> None:
    sys.stdout.write(json.dumps(message) + '\n')
    sys.stdout.flush()


def _result(request_id, result: Any) -> None:
    _send({'jsonrpc': '2.0', 'id': request_id, 'result': result})


def _error(request_id, code: int, message: str) -> None:
    _send({'jsonrpc': '2.0', 'id': request_id, 'error': {'code': code, 'message': message}})


def _handle_initialize(request_id, _params: dict) -> None:
    _result(request_id, {
        'protocolVersion': PROTOCOL_VERSION,
        'capabilities': {'tools': {}},
        'serverInfo': SERVER_INFO,
    })


def _handle_tools_list(request_id, _params: dict) -> None:
    _result(request_id, {
        'tools': [
            {'name': t['name'], 'description': t['description'], 'inputSchema': t['inputSchema']}
            for t in TOOLS
        ]
    })


def _handle_tools_call(request_id, params: dict) -> None:
    name = params.get('name', '')
    arguments = params.get('arguments') or {}
    tool = _TOOLS_BY_NAME.get(name)
    if tool is None:
        _error(request_id, -32602, f'unknown tool: {name}')
        return
    try:
        value = tool['handler'](arguments)
        text = value if isinstance(value, str) else json.dumps(value, default=str)
        _result(request_id, {'content': [{'type': 'text', 'text': text}], 'isError': False})
    except Exception as exc:  # noqa: BLE001 - surfaced to the calling agent, not raised
        _result(request_id, {'content': [{'type': 'text', 'text': str(exc)}], 'isError': True})


_METHODS: dict[str, Callable] = {
    'initialize': _handle_initialize,
    'tools/list': _handle_tools_list,
    'tools/call': _handle_tools_call,
}


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue

        method = message.get('method', '')
        request_id = message.get('id')

        if request_id is None:
            # Notification (e.g. notifications/initialized) — no response expected.
            continue

        handler = _METHODS.get(method)
        if handler is None:
            _error(request_id, -32601, f'method not found: {method}')
            continue
        handler(request_id, message.get('params') or {})

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
