"""
V3 hardening: the verifier must read the consensus answer robustly.

Live finding: a correct Reject verdict arrived wrapped in a markdown code fence
("```json ... ```") and json.loads threw, reverting the whole review. These tests
drive the real run_review / verify_fix code with the model answer mocked in the
shapes that occur in practice.
"""
import json
import re
import conftest as C

VERIFIER = "contracts/remedy_verifier.py"
SRC = "contract CredencePayout { function claim() external { } }"


def _verdict(outcome="Reject", severity="None", payout=0):
    return {
        "outcome": outcome, "severity": severity, "payout": payout,
        "patch_assessment": "none submitted",
        "reasoning": "the code checks the call result with require(ok)",
        "minority_note": "a stale comment in the file still says vulnerable",
        "duplicate_of_seq": -1, "original_bps": 10000, "duplicate_bps": 0,
    }


def _claim(patched=""):
    return {
        "claim_id": "clm_0", "campaign_id": "cam_0", "target_url": C.PINNED,
        "poc_text": "unchecked call in claim()", "patch_diff": "",
        "claimed_severity": "High", "patched_url": patched,
    }


CAMPAIGN = {
    "status": "active", "is_critical_target": False,
    "pay_critical": 10000, "pay_high": 5000, "pay_medium": 2000, "pay_low": 500,
}


def _setup(direct_vm, direct_deploy, prompt, patched=""):
    v = direct_deploy(VERIFIER, C.OWNER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    direct_vm.sender = Address(C.OWNER)
    v.set_vault(C.DUMMY_VAULT)
    direct_vm.mock_web(re.escape(C.PINNED), {"method": "GET", "status": 200, "body": SRC})
    if patched:
        direct_vm.mock_web(re.escape(patched), {"method": "GET", "status": 200, "body": SRC + " // fixed"})
    direct_vm._gl_call_hook = C.make_hook({
        "get_claim": _claim(patched),
        "get_campaign": CAMPAIGN,
        "get_priors_json": "[]",
    }, prompt=prompt)
    return v


def test_fenced_verdict_is_parsed(direct_vm, direct_deploy):
    # the exact shape that broke the live clm_1 review
    fenced = "```json\n" + json.dumps(_verdict(), indent=2) + "\n```"
    v = _setup(direct_vm, direct_deploy, fenced)
    assert v.run_review("clm_0") == "remedy_0"
    got = v.get_verdict("remedy_0")
    assert got["outcome"] == "Reject" and got["severity"] == "None"
    assert v.get_case_for_claim("clm_0") == "remedy_0"


def test_prose_wrapped_verdict_is_parsed(direct_vm, direct_deploy):
    wrapped = "Here is my verdict:\n" + json.dumps(_verdict("Reward", "High", 5000)) + "\nEnd of verdict."
    v = _setup(direct_vm, direct_deploy, wrapped)
    assert v.run_review("clm_0") == "remedy_0"
    assert v.get_verdict("remedy_0")["outcome"] == "Reward"


def test_unreadable_verdict_refused_and_claim_stays_reviewable(direct_vm, direct_deploy):
    v = _setup(direct_vm, direct_deploy, "I cannot reach a decision on this claim.")
    with direct_vm.expect_revert("not a readable JSON object"):
        v.run_review("clm_0")
    # nothing recorded: no case, no lock, so a later review is still possible
    assert v.get_case_for_claim("clm_0") == ""
    assert v.get_verdict_count() == 0
    direct_vm._gl_call_hook = C.make_hook({
        "get_claim": _claim(), "get_campaign": CAMPAIGN, "get_priors_json": "[]",
    }, prompt=json.dumps(_verdict()))
    assert v.run_review("clm_0") == "remedy_0"


def test_unknown_outcome_refused(direct_vm, direct_deploy):
    v = _setup(direct_vm, direct_deploy, json.dumps(_verdict(outcome="Maybe")))
    with direct_vm.expect_revert("unknown outcome"):
        v.run_review("clm_0")
    assert v.get_case_for_claim("clm_0") == ""


def test_verify_fix_fenced_answer_is_parsed(direct_vm, direct_deploy):
    fenced = "```json\n" + json.dumps({"fixed": True, "reasoning": "require(ok) added"}) + "\n```"
    v = _setup(direct_vm, direct_deploy, fenced, patched=C.PATCHED)
    assert v.verify_fix("clm_0") is True
    r = v.get_fix_result(C.PATCHED)
    assert r["checked"] is True and r["fixed"] is True


def test_verify_fix_string_false_is_not_fixed(direct_vm, direct_deploy):
    # bool("false") is True in Python; a string "false" must record NOT fixed
    answer = json.dumps({"fixed": "false", "reasoning": "the check is still missing"})
    v = _setup(direct_vm, direct_deploy, answer, patched=C.PATCHED)
    assert v.verify_fix("clm_0") is False
    r = v.get_fix_result(C.PATCHED)
    assert r["checked"] is True and r["fixed"] is False
