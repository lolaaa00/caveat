"""
Verify that the working tree's contracts/caveat.py matches the SHA-256 hash recorded
as the deployed source in artifacts/deployment.studio_devnet.json.

Why this exists, not a commit reference: the deployment manifest originally recorded
a source_commit (3ae7a11a780833af716cf97874c4bf44f2e30d41). A later, separate commit-message
rewrite (stripping AI co-authorship trailers from history) changed every commit hash in
this repository while leaving file trees byte-identical — the original commit object is
no longer reachable from any branch. Rather than assert which current commit "is" the
deployment commit, this script lets anyone independently verify the one claim that
actually matters: the exact bytes of the deployed contract source.

    python3 scripts/verify_source_hash.py

Exits 0 and prints OK if contracts/caveat.py's SHA-256 matches the recorded hash;
exits 1 and prints the mismatch otherwise.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / 'contracts' / 'caveat.py'
MANIFEST_PATH = ROOT / 'artifacts' / 'deployment.studio_devnet.json'


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text())
    expected = manifest.get('source_sha256')
    if not expected:
        print(f'FAIL: {MANIFEST_PATH} has no source_sha256 field.', file=sys.stderr)
        return 1

    actual = hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()

    print(f'contract file : {CONTRACT_PATH.relative_to(ROOT)}')
    print(f'expected sha256: {expected}')
    print(f'actual sha256  : {actual}')

    if actual != expected:
        print('FAIL: contracts/caveat.py does not match the recorded deployment hash.', file=sys.stderr)
        return 1

    print('OK: contracts/caveat.py is byte-for-byte identical to the deployed source.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
