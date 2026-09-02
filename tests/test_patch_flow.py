import hashlib
import json
import re
import conftest as C
import pytest


ORIGINAL_SRC = ("pragma solidity ^0.8.0;\ncontract CredencePayout {\n"
                "  function claim() external { owed[msg.sender]=0; msg.sender.call{value:a}(\"\"); }\n}\n")
PATCHED_SRC = ("pragma solidity ^0.8.0;\ncontract CredencePayout {\n"
               "  function claim() external { owed[msg.sender]=0; (bool ok,)=msg.sender.call{value:a}(\"\"); require(ok); }\n}\n")


NOT_FIXED = json.dumps({"fixed": False, "reasoning": "the low-level call return value is still unchecked"})
FIXED = json.dumps({"fixed": True, "reasoning": "the patched claim() now requires the low-level call to succeed"})


def _claim(patched_url):
    return {
        "claim_id": "clm_0", "campaign_id": "cam_0", "seq": 0, "submitter": C.HUNTER,
        "submitted_at": "2026-01-01T00:00:00Z", "target_url": C.PINNED,
        "poc_text": "claim() ignores the low-level call return value; a failed transfer still clears the debt",
        "patch_diff": "", "claimed_severity": "High", "status": "held", "outcome": "HoldForPatch",
        "severity": "High", "payout": 0, "escrowed": 5000, "case_id": "remedy_0",
        "reasoning": "", "minority_note": "", "merged_with": "", "attribution_bps": 0,
        "held_at": "2026-06-01T00:00:00Z", "patched_url": patched_url,
    }


def _verifier(direct_vm, direct_deploy):
    v = direct_deploy("contracts/remedy_verifier.py", C.OWNER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    direct_vm.sender = Address(C.OWNER)
    v.set_vault(C.DUMMY_VAULT)
    return v, Address


def test_verify_fix_against_unchanged_original_is_not_fixed(direct_vm, direct_deploy):
    v, Address = _verifier(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = C.make_hook({"get_claim": _claim(C.PINNED)}, prompt=NOT_FIXED)
    direct_vm.mock_web(re.escape(C.PINNED), {"method": "GET", "status": 200, "body": ORIGINAL_SRC})
    direct_vm.sender = Address(C.BYSTNDR)
    assert v.verify_fix("clm_0") is False
    fr = v.get_fix_result(C.PINNED)
    assert fr["checked"] and not fr["fixed"]
    print("VERIFY-FIX vs UNCHANGED ORIGINAL => not fixed OK")


def test_verify_fix_against_distinct_patched_artifact_is_fixed(direct_vm, direct_deploy):
    v, Address = _verifier(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = C.make_hook({"get_claim": _claim(C.PATCHED)}, prompt=FIXED)
    direct_vm.mock_web(re.escape(C.PATCHED), {"method": "GET", "status": 200, "body": PATCHED_SRC})
    direct_vm.sender = Address(C.BYSTNDR)
    assert v.verify_fix("clm_0") is True
    fr = v.get_fix_result(C.PATCHED)
    assert fr["checked"] and fr["fixed"]
    assert fr["source_hash"] == hashlib.sha256(PATCHED_SRC.encode("utf-8")).hexdigest()
    print("VERIFY-FIX vs DISTINCT PATCHED ARTIFACT => fixed, hash-bound OK")


def test_same_artifact_cannot_be_reverified(direct_vm, direct_deploy):
    v, Address = _verifier(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = C.make_hook({"get_claim": _claim(C.PATCHED)}, prompt=FIXED)
    direct_vm.mock_web(re.escape(C.PATCHED), {"method": "GET", "status": 200, "body": PATCHED_SRC})
    direct_vm.sender = Address(C.BYSTNDR)
    v.verify_fix("clm_0")
    with pytest.raises(Exception):
        v.verify_fix("clm_0")
    print("REPEAT SAME ARTIFACT => refused OK")


def test_distinct_artifact_gets_fresh_verdict_prior_stays_immutable(direct_vm, direct_deploy):
    v, Address = _verifier(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = C.make_hook({"get_claim": _claim(C.PINNED)}, prompt=NOT_FIXED)
    direct_vm.mock_web(re.escape(C.PINNED), {"method": "GET", "status": 200, "body": ORIGINAL_SRC})
    direct_vm.mock_web(re.escape(C.PATCHED), {"method": "GET", "status": 200, "body": PATCHED_SRC})
    direct_vm.sender = Address(C.BYSTNDR)
    assert v.verify_fix("clm_0") is False
    direct_vm._gl_call_hook = C.make_hook({"get_claim": _claim(C.PATCHED)}, prompt=FIXED)
    assert v.verify_fix("clm_0") is True
    assert v.get_fix_result(C.PATCHED)["fixed"] is True
    assert v.get_fix_result(C.PINNED)["fixed"] is False
    print("DISTINCT ARTIFACT => fresh verdict, prior stays immutable OK")


def test_verify_fix_requires_a_submitted_artifact(direct_vm, direct_deploy):
    v, Address = _verifier(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = C.make_hook({"get_claim": _claim("")}, prompt=FIXED)
    direct_vm.sender = Address(C.BYSTNDR)
    with pytest.raises(Exception):
        v.verify_fix("clm_0")
    print("VERIFY-FIX with no submitted artifact => refused OK")