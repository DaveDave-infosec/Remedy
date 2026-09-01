import conftest as C
import pytest


def test_commit_pin_accept_and_reject(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    direct_vm.sender = Address(C.PROJECT)
    vault.faucet()

    # a commit-pinned URL is accepted
    assert vault.open_campaign(C.PINNED, 20000, 10000, 5000, 2000, 500, False) == "cam_0"

    # every mutable / malformed target is rejected
    bad = [
        C.BRANCH,
        "https://raw.githubusercontent.com/o/r/master/X.sol",
        "https://raw.githubusercontent.com/o/r/3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f/X.sol",
        "https://raw.githubusercontent.com/o/r/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/X.sol",
        "https://raw.githubusercontent.com/o/r/3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a",
        "https://github.com/o/r/blob/3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a/X.sol",
        "https://evil.com/raw.githubusercontent.com/o/r/3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a/X.sol",
    ]
    for u in bad:
        with pytest.raises(Exception):
            vault.open_campaign(u, 20000, 10000, 5000, 2000, 500, False)
    print("PIN VALIDATION OK (1 accepted, %d rejected)" % len(bad))