"""
Steward round: three trust-boundary bindings.

1. A fix verdict belongs to one claim judging one artifact. A second claim that
   submits the same artifact cannot inherit the first claim's verdict, and its
   escrow cannot release on it.
2. A MergeDuplicate must reference an EARLIER claim on the SAME target.
3. Escalate is only available where the campaign itself is flagged critical.
"""
import re
import pytest
import conftest as C

VAULT = "contracts/remedy_vault.py"
VERIFIER = "contracts/remedy_verifier.py"
AT = "2026-01-01T00:00:00Z"
SRC = "contract VaultBank { function withdraw() external { } }"


def _S(a):
    from genlayer.py.types import Address
    return Address(a)


def test_fix_verdict_is_per_claim_not_per_artifact(direct_vm, direct_deploy):
    v = direct_deploy(VERIFIER, C.OWNER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    direct_vm.sender = Address(C.OWNER)
    v.set_vault(C.DUMMY_VAULT)
    direct_vm.mock_web(re.escape(C.PATCHED), {"method": "GET", "status": 200, "body": SRC})

    def claim_for(cc):
        cid = cc["calldata"]["args"][0]
        return {
            "claim_id": cid, "campaign_id": "cam_0", "target_url": C.PINNED,
            "poc_text": "reentrancy in withdraw()", "patch_diff": "",
            "claimed_severity": "High", "patched_url": C.PATCHED,
        }

    answer = '{"fixed": true, "reasoning": "the balance is cleared before the call"}'
    direct_vm._gl_call_hook = C.make_hook({"get_claim": claim_for}, prompt=answer)

    assert v.verify_fix("clm_0") is True
    assert v.get_fix_result("clm_0", C.PATCHED)["checked"] is True
    assert v.get_fix_result("clm_1", C.PATCHED)["checked"] is False
    assert v.verify_fix("clm_1") is True
    assert v.get_fix_result("clm_1", C.PATCHED)["checked"] is True
    with direct_vm.expect_revert("already has a fix verdict"):
        v.verify_fix("clm_0")


def test_release_refuses_another_claims_verdict(direct_vm, direct_deploy):
    vault = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    vault.faucet()
    vault.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, False, 0)

    direct_vm.sender = _S(C.HUNTER)
    a = vault.submit_claim("cam_0", AT, 0, "poc one", "--- patch ---", "High")
    b = vault.submit_claim("cam_0", AT, 0, "poc two", "--- patch ---", "High")

    direct_vm.warp("2026-06-01T00:00:00Z")
    for cid in (a, b):
        direct_vm._gl_call_hook = C.make_hook({
            "get_case_for_claim": "remedy_0",
            "get_verdict": C.verdict(cid, C.PINNED, "HoldForPatch", "High"),
        })
        direct_vm.sender = _S(C.BYSTNDR)
        assert vault.settle_claim(cid) == "HoldForPatch"

    direct_vm.sender = _S(C.HUNTER)
    vault.submit_fix(a, C.PATCHED)
    vault.submit_fix(b, C.PATCHED)

    def fix_for(cc):
        cid = cc["calldata"]["args"][0]
        if cid == a:
            return {"checked": True, "fixed": True, "reasoning": "fixed", "source_hash": "h"}
        return {"checked": False, "fixed": False, "reasoning": "", "source_hash": ""}

    direct_vm._gl_call_hook = C.make_hook({"get_fix_result": fix_for})
    direct_vm.sender = _S(C.BYSTNDR)

    with direct_vm.expect_revert("no fix verdict yet"):
        vault.release_escrow(b)
    assert vault.release_escrow(a) == "released"


def test_merge_refuses_a_later_claim_as_the_original(direct_vm, direct_deploy):
    vault = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    vault.faucet()
    vault.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, False, 0)
    direct_vm.sender = _S(C.HUNTER)
    first = vault.submit_claim("cam_0", AT, 0, "the original", "", "High")
    vault.submit_claim("cam_0", AT, 0, "a later claim", "", "High")

    merged = C.verdict(first, C.PINNED, "MergeDuplicate", "High",
                       duplicate_of_seq=1, original_bps=7000, duplicate_bps=3000)
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0", "get_verdict": merged,
    })
    direct_vm.sender = _S(C.BYSTNDR)
    with direct_vm.expect_revert("EARLIER"):
        vault.settle_claim(first)


def test_merge_refuses_an_original_on_another_target(direct_vm, direct_deploy):
    vault = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    vault.faucet()
    vault.open_campaign([C.PINNED, C.PATCHED], 20000, 10000, 5000, 2000, 500, False, 0)
    direct_vm.sender = _S(C.HUNTER)
    vault.submit_claim("cam_0", AT, 0, "claim on target 0", "", "High")
    later = vault.submit_claim("cam_0", AT, 1, "claim on target 1", "", "High")

    merged = C.verdict(later, C.PATCHED, "MergeDuplicate", "High",
                       duplicate_of_seq=0, original_bps=7000, duplicate_bps=3000)
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0", "get_verdict": merged,
    })
    direct_vm.sender = _S(C.BYSTNDR)
    with direct_vm.expect_revert("SAME target"):
        vault.settle_claim(later)


def test_escalate_refused_on_a_non_critical_campaign(direct_vm, direct_deploy):
    vault = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    vault.faucet()
    vault.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, False, 0)
    direct_vm.sender = _S(C.HUNTER)
    cid = vault.submit_claim("cam_0", AT, 0, "poc", "", "Critical")

    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": C.verdict(cid, C.PINNED, "Escalate", "Critical"),
    })
    direct_vm.sender = _S(C.BYSTNDR)
    with direct_vm.expect_revert("not a predefined critical target"):
        vault.settle_claim(cid)
    assert vault.get_campaign("cam_0")["status"] == "active"
    assert vault.get_claim(cid)["status"] == "open"
