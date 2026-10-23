"""
V4: per-target payout tiers and an optional second cited target.

Rules proven here, on the real vault and verifier code:
- each target carries its own severity schedule, fixed when the campaign opens
- an empty tier list means every target uses the campaign schedule
- malformed tier lists are refused and consume no campaign id
- a claim may cite ONE second target of the same campaign, never its own primary
- a claim is paid from its PRIMARY target's schedule, whichever target is dearer
- duplicate priors include any claim that shares a target, so the same
  cross-contract flaw filed from either side is caught, and unrelated contracts
  are still never shown
- a merge is accepted across a reversed cross-contract filing and refused when
  the two claims share no target
- settlement refuses a verdict whose second target does not match the claim's
- the verifier fetches, size-checks and hashes the second source, shows the
  model both sources, and shows it the claim's own schedule
"""
import hashlib
import json
import re
import conftest as C

VAULT = "contracts/remedy_vault.py"
VERIFIER = "contracts/remedy_verifier.py"
AT = "2026-01-01T00:00:00Z"

T0 = C.PINNED
T1 = C.PATCHED
T2 = C.PATCHED2

DEAR = [4000, 2000, 1000, 250]
CHEAP = [800, 400, 200, 50]


def _S(a):
    from genlayer.py.types import Address
    return Address(a)


def _vault(direct_vm, direct_deploy, targets, tiers):
    v = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    v.faucet()
    v.open_campaign(targets, 20000, 4000, 2000, 1000, 250, False, 0, tiers)
    return v


def _file(direct_vm, v, idx, second=-1, poc="poc"):
    direct_vm.sender = _S(C.HUNTER)
    return v.submit_claim("cam_0", AT, idx, poc, "", "High", second)


def _settle(direct_vm, v, claim_id, verdict_obj):
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": verdict_obj,
    })
    direct_vm.sender = _S(C.BYSTNDR)
    return v.settle_claim(claim_id)


# ---------------- per-target tiers ----------------

def test_per_target_tiers_are_stored_and_exposed(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1], [DEAR, CHEAP])
    camp = v.get_campaign("cam_0")
    assert camp["target_tiers"] == [DEAR, CHEAP]


def test_empty_tier_list_uses_the_campaign_schedule(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1], [])
    assert v.get_campaign("cam_0")["target_tiers"] == [DEAR, DEAR]


def test_malformed_tier_lists_are_refused(direct_vm, direct_deploy):
    v = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    v.faucet()
    with direct_vm.expect_revert("one schedule per target"):
        v.open_campaign([T0, T1], 20000, 4000, 2000, 1000, 250, False, 0, [DEAR])
    with direct_vm.expect_revert("four payouts"):
        v.open_campaign([T0], 20000, 4000, 2000, 1000, 250, False, 0, [[4000, 2000, 1000]])
    with direct_vm.expect_revert("cannot be negative"):
        v.open_campaign([T0], 20000, 4000, 2000, 1000, 250, False, 0, [[4000, 2000, -1, 250]])
    assert v.get_campaign_count() == 0


def test_claim_is_paid_from_its_primary_targets_schedule(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1], [DEAR, CHEAP])
    direct_vm.sender = _S(C.HUNTER)
    v.faucet()

    # primary is the cheap target, second is the dear one: paid from the CHEAP schedule
    a = _file(direct_vm, v, 1, second=0)
    assert _settle(direct_vm, v, a, C.verdict(a, T1, "Reward", "High", second_target_url=T0)) == "Reward"
    assert v.get_claim(a)["payout"] == 400 - 400 * C.FEE_BPS // 10000

    # primary is the dear target, second is the cheap one: paid from the DEAR schedule
    b = _file(direct_vm, v, 0, second=1, poc="another flaw")
    assert _settle(direct_vm, v, b, C.verdict(b, T0, "Reward", "High", second_target_url=T1)) == "Reward"
    assert v.get_claim(b)["payout"] == 2000 - 2000 * C.FEE_BPS // 10000

    # the claim view exposes the schedule the claim will actually be paid from
    assert v.get_claim(a)["pay_high"] == 400
    assert v.get_claim(b)["pay_high"] == 2000


# ---------------- the second cited target ----------------

def test_second_target_is_validated_and_resolved(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1], [])
    direct_vm.sender = _S(C.HUNTER)
    with direct_vm.expect_revert("out of range"):
        v.submit_claim("cam_0", AT, 0, "poc", "", "High", 2)
    with direct_vm.expect_revert("must differ from the primary"):
        v.submit_claim("cam_0", AT, 0, "poc", "", "High", 0)

    none = v.submit_claim("cam_0", AT, 0, "single", "", "High", -1)
    assert v.get_claim(none)["second_target_index"] == -1
    assert v.get_claim(none)["second_target_url"] == ""

    two = v.submit_claim("cam_0", AT, 0, "cross", "", "High", 1)
    cl = v.get_claim(two)
    assert cl["target_url"] == T0
    assert cl["second_target_index"] == 1
    assert cl["second_target_url"] == T1


def test_priors_include_any_claim_sharing_a_target(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1, T2], [])
    a = _file(direct_vm, v, 0, poc="on target 0")
    b = _file(direct_vm, v, 1, poc="on target 1")
    c = _file(direct_vm, v, 1, second=0, poc="target 1 citing target 0")
    d = _file(direct_vm, v, 2, poc="on target 2")

    def priors(cid):
        return {p["claim_id"] for p in json.loads(v.get_priors_json("cam_0", cid))}

    assert priors(c) == {a, b}      # shares target 0 with a, target 1 with b
    assert priors(a) == {c}         # only c touches target 0
    assert priors(b) == {c}         # only c touches target 1
    assert priors(d) == set()       # nobody else touches target 2


def test_reversed_cross_contract_filing_can_merge(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1], [DEAR, CHEAP])
    direct_vm.sender = _S(C.HUNTER2)
    v.faucet()
    first = _file(direct_vm, v, 0, second=1, poc="flaw between 0 and 1, filed from 0")
    direct_vm.sender = _S(C.HUNTER2)
    later = v.submit_claim("cam_0", AT, 1, "same flaw, filed from 1", "", "High", 0)

    merged = C.verdict(later, T1, "MergeDuplicate", "High", second_target_url=T0,
                       duplicate_of_seq=0, original_bps=7000, duplicate_bps=3000)
    assert _settle(direct_vm, v, later, merged) == "MergeDuplicate"
    assert v.get_claim(later)["merged_with"] == first
    # the total split is the SETTLED claim's primary schedule (target 1, High = 400)
    assert v.get_campaign("cam_0")["pool"] == 20000 - 400


def test_merge_refused_when_claims_share_no_target(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1, T2], [])
    _file(direct_vm, v, 0, poc="only target 0")
    later = _file(direct_vm, v, 1, second=2, poc="targets 1 and 2")
    merged = C.verdict(later, T1, "MergeDuplicate", "High", second_target_url=T2,
                       duplicate_of_seq=0, original_bps=7000, duplicate_bps=3000)
    with direct_vm.expect_revert("SAME target"):
        _settle(direct_vm, v, later, merged)


def test_settle_refuses_a_verdict_with_the_wrong_second_target(direct_vm, direct_deploy):
    v = _vault(direct_vm, direct_deploy, [T0, T1, T2], [])
    cid = _file(direct_vm, v, 0, second=1)
    with direct_vm.expect_revert("second target"):
        _settle(direct_vm, v, cid, C.verdict(cid, T0, "Reward", "High"))
    with direct_vm.expect_revert("second target"):
        _settle(direct_vm, v, cid, C.verdict(cid, T0, "Reward", "High", second_target_url=T2))
    assert v.get_claim(cid)["status"] == "open"


# ---------------- the verifier side ----------------

PRIMARY_SRC = "contract Vault { function withdraw() external { router.pay(msg.sender); } }"
SECOND_SRC = "contract Router { function pay(address to) external { to.call{value: 1}(''); } }"

VERDICT = {
    "outcome": "Reward", "severity": "High", "payout": 0, "patch_assessment": "none submitted",
    "reasoning": "the vault trusts the router's callback", "minority_note": "",
    "duplicate_of_seq": -1, "original_bps": 10000, "duplicate_bps": 0,
}


def _claim(second_url, pay_high=2000):
    return {
        "claim_id": "clm_0", "campaign_id": "cam_0", "target_url": T0,
        "poc_text": "cross-contract reentrancy through the router", "patch_diff": "",
        "claimed_severity": "High", "second_target_url": second_url,
        "pay_critical": 4000, "pay_high": pay_high, "pay_medium": 1000, "pay_low": 250,
    }


CAMPAIGN = {
    "status": "active", "is_critical_target": False,
    "pay_critical": 9999, "pay_high": 9999, "pay_medium": 9999, "pay_low": 9999,
}


def _verifier(direct_vm, direct_deploy, claim, second_body=SECOND_SRC):
    v = direct_deploy(VERIFIER, C.OWNER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    direct_vm.sender = Address(C.OWNER)
    v.set_vault(C.DUMMY_VAULT)
    direct_vm.mock_web(re.escape(T0), {"method": "GET", "status": 200, "body": PRIMARY_SRC})
    direct_vm.mock_web(re.escape(T1), {"method": "GET", "status": 200, "body": second_body})
    seen = []
    inner = C.make_hook({
        "get_claim": claim, "get_campaign": CAMPAIGN, "get_priors_json": "[]",
    }, prompt=json.dumps(VERDICT))

    def hook(vm, req):
        if "ExecPromptTemplate" in req:
            seen.append(req["ExecPromptTemplate"])
        return inner(vm, req)

    direct_vm._gl_call_hook = hook
    return v, seen


def test_review_fetches_hashes_and_shows_both_sources(direct_vm, direct_deploy):
    v, seen = _verifier(direct_vm, direct_deploy, _claim(T1))
    assert v.run_review("clm_0") == "remedy_0"
    got = v.get_verdict("remedy_0")
    assert got["target_url"] == T0
    assert got["second_target_url"] == T1
    assert got["source_hash"] == hashlib.sha256(PRIMARY_SRC.encode("utf-8")).hexdigest()
    assert got["second_source_hash"] == hashlib.sha256(SECOND_SRC.encode("utf-8")).hexdigest()
    shown = json.dumps(seen[0], default=str)
    assert "the researcher says the flaw involves" in shown
    assert "contract Router" in shown


def test_single_target_review_records_no_second_source(direct_vm, direct_deploy):
    v, seen = _verifier(direct_vm, direct_deploy, _claim(""))
    v.run_review("clm_0")
    got = v.get_verdict("remedy_0")
    assert got["second_target_url"] == "" and got["second_source_hash"] == ""
    shown = json.dumps(seen[0], default=str)
    # the instructions always describe the two-source case; the source section itself is absent
    assert "the researcher says the flaw involves" not in shown
    assert "contract Router" not in shown


def test_oversize_second_source_is_refused(direct_vm, direct_deploy):
    v, _ = _verifier(direct_vm, direct_deploy, _claim(T1), second_body="x" * 24001)
    with direct_vm.expect_revert("second cited target exceeds"):
        v.run_review("clm_0")
    assert v.get_case_for_claim("clm_0") == ""


def test_model_is_shown_the_claims_own_schedule(direct_vm, direct_deploy):
    v, seen = _verifier(direct_vm, direct_deploy, _claim("", pay_high=1234))
    v.run_review("clm_0")
    shown = json.dumps(seen[0], default=str)
    assert "High=1234" in shown
    assert "9999" not in shown
