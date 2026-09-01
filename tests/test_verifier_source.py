import hashlib
import json
import conftest as C
import pytest

SOURCE = "// SPDX\npragma solidity ^0.8.0;\ncontract CredencePayout {\n  function claim() external { owed[msg.sender]=0; msg.sender.call{value:a}(\"\"); }\n}\n"

CLAIM = {
    "claim_id": "clm_0", "campaign_id": "cam_0", "seq": 0, "submitter": C.HUNTER,
    "submitted_at": "2026-01-01T00:00:00Z", "target_url": C.PINNED,
    "poc_text": "claim() ignores the low-level call return value", "patch_diff": "",
    "claimed_severity": "High", "status": "open", "outcome": "", "severity": "",
    "payout": 0, "escrowed": 0, "case_id": "", "reasoning": "", "minority_note": "",
    "merged_with": "", "attribution_bps": 0, "held_at": "",
}
CAMPAIGN = {
    "campaign_id": "cam_0", "project": C.PROJECT, "target_url": C.PINNED,
    "pool": 20000, "escrowed": 0, "paid_total": 0, "status": "active",
    "pay_critical": 10000, "pay_high": 5000, "pay_medium": 2000, "pay_low": 500,
    "is_critical_target": False, "claim_count": 1,
}
VERDICT_JSON = json.dumps({
    "outcome": "Reward", "severity": "High", "payout": 5000,
    "patch_assessment": "none submitted",
    "reasoning": "claim() makes a low-level call and ignores its return value",
    "minority_note": "", "duplicate_of_seq": -1, "original_bps": 10000, "duplicate_bps": 0,
})


def _vault_hook(claim=None):
    return C.make_hook({
        "get_claim": claim if claim is not None else CLAIM,
        "get_campaign": CAMPAIGN,
        "get_priors_json": "[]",
    }, prompt=VERDICT_JSON)


def _wire(direct_vm, direct_deploy):
    verifier = direct_deploy("contracts/remedy_verifier.py", C.OWNER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    direct_vm.sender = Address(C.OWNER)
    verifier.set_vault(C.DUMMY_VAULT)
    return verifier, Address


def test_source_hash_recorded(direct_vm, direct_deploy):
    verifier, Address = _wire(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = _vault_hook()
    direct_vm.mock_web(r"raw\.githubusercontent\.com", {"method": "GET", "status": 200, "body": SOURCE})
    direct_vm.sender = Address(C.BYSTNDR)
    case_id = verifier.run_review("clm_0")
    v = verifier.get_verdict(case_id)
    assert v["outcome"] == "Reward"
    assert v["source_hash"] == hashlib.sha256(SOURCE.encode("utf-8")).hexdigest()
    print("SOURCE HASH RECORDED OK")


def test_oversize_source_refused(direct_vm, direct_deploy):
    verifier, Address = _wire(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = _vault_hook()
    direct_vm.mock_web(r"raw\.githubusercontent\.com", {"method": "GET", "status": 200, "body": "A" * 24001})
    direct_vm.sender = Address(C.BYSTNDR)
    with pytest.raises(Exception):
        verifier.run_review("clm_0")
    print("OVERSIZE SOURCE REFUSED OK")


def test_one_review_per_claim(direct_vm, direct_deploy):
    verifier, Address = _wire(direct_vm, direct_deploy)
    direct_vm._gl_call_hook = _vault_hook()
    direct_vm.mock_web(r"raw\.githubusercontent\.com", {"method": "GET", "status": 200, "body": SOURCE})
    direct_vm.sender = Address(C.BYSTNDR)
    verifier.run_review("clm_0")
    with pytest.raises(Exception):
        verifier.run_review("clm_0")
    print("ONE-REVIEW-PER-CLAIM LOCK OK")