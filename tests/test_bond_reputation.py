"""
V3 pillar 2: claim bond + researcher reputation, on the real vault code path.

Rules proven here:
- submitting a claim locks the campaign's bond from the researcher
- Reject forfeits the bond into the campaign pool
- every credible outcome (Reward, HoldForPatch, MergeDuplicate, Escalate) and a
  pre-review dismissal return the bond; a bond moves exactly once
- the researcher's on-chain record updates at settlement, release, and dismissal
"""
import pytest
import conftest as C

VAULT = "contracts/remedy_vault.py"
AT = "2026-01-01T00:00:00Z"
BOND = 300


def _S(a):
    from genlayer.py.types import Address
    return Address(a)


def _campaign(direct_vm, direct_deploy, bond=BOND, critical=False):
    v = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    v.faucet()
    v.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, critical, bond)
    for h in (C.HUNTER, C.HUNTER2):
        direct_vm.sender = _S(h)
        v.faucet()
    return v


def _file(direct_vm, v, who, poc="poc", patch=""):
    direct_vm.sender = _S(who)
    return v.submit_claim("cam_0", AT, 0, poc, patch, "High")


def _settle(direct_vm, v, claim_id, verdict_obj):
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": verdict_obj,
    })
    direct_vm.sender = _S(C.BYSTNDR)
    return v.settle_claim(claim_id)


def test_submit_locks_bond_and_counts(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    assert v.get_campaign("cam_0")["bond"] == BOND
    cid = _file(direct_vm, v, C.HUNTER)
    cl = v.get_claim(cid)
    assert cl["bond"] == BOND and cl["bond_status"] == "locked"
    assert v.balance_of(C.HUNTER) == 50000 - BOND
    assert v.get_reputation(C.HUNTER)["submitted"] == 1


def test_bond_requires_balance(direct_vm, direct_deploy):
    v = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    v.faucet()
    v.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, False, BOND)
    direct_vm.sender = _S(C.HUNTER)  # never claimed the faucet: balance 0
    with direct_vm.expect_revert("claim bond"):
        v.submit_claim("cam_0", AT, 0, "poc", "", "High")
    assert v.get_campaign("cam_0")["claim_count"] == 0


def test_negative_bond_refused(direct_vm, direct_deploy):
    v = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    v.faucet()
    with direct_vm.expect_revert("cannot be negative"):
        v.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, False, -1)


def test_zero_bond_campaign_needs_no_balance(direct_vm, direct_deploy):
    v = direct_deploy(VAULT, C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    direct_vm.sender = _S(C.PROJECT)
    v.faucet()
    v.open_campaign([C.PINNED], 20000, 10000, 5000, 2000, 500, False, 0)
    cid = _file(direct_vm, v, C.HUNTER)  # HUNTER has no balance at all
    assert v.get_claim(cid)["bond_status"] == "none"


def test_reject_forfeits_bond_into_pool(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    cid = _file(direct_vm, v, C.HUNTER)
    assert _settle(direct_vm, v, cid, C.verdict(cid, C.PINNED, "Reject", "None")) == "Reject"
    assert v.get_claim(cid)["bond_status"] == "forfeited"
    assert v.balance_of(C.HUNTER) == 50000 - BOND
    assert v.get_campaign("cam_0")["pool"] == 20000 + BOND
    rep = v.get_reputation(C.HUNTER)
    assert rep["rejected"] == 1 and rep["rewarded"] == 0 and rep["earned"] == 0


def test_reward_returns_bond_and_records_earnings(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    cid = _file(direct_vm, v, C.HUNTER)
    assert _settle(direct_vm, v, cid, C.verdict(cid, C.PINNED, "Reward", "High")) == "Reward"
    assert v.get_claim(cid)["bond_status"] == "returned"
    # bond back in full, plus High 5000 minus the 2.5% fee
    assert v.balance_of(C.HUNTER) == 50000 + 4875
    assert v.get_campaign("cam_0")["pool"] == 15000
    rep = v.get_reputation(C.HUNTER)
    assert rep["rewarded"] == 1 and rep["earned"] == 4875


def test_hold_returns_bond_then_release_records_reward(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    cid = _file(direct_vm, v, C.HUNTER, patch="--- patch ---")
    direct_vm.warp("2026-06-01T00:00:00Z")
    assert _settle(direct_vm, v, cid, C.verdict(cid, C.PINNED, "HoldForPatch", "High")) == "HoldForPatch"
    assert v.get_claim(cid)["bond_status"] == "returned"
    assert v.balance_of(C.HUNTER) == 50000
    assert v.get_reputation(C.HUNTER)["rewarded"] == 0  # not paid yet

    direct_vm.sender = _S(C.HUNTER)
    v.submit_fix(cid, C.PATCHED)
    direct_vm._gl_call_hook = C.make_hook({"get_fix_result": {"checked": True, "fixed": True, "reasoning": "fixed", "source_hash": "y"}})
    direct_vm.sender = _S(C.BYSTNDR)
    assert v.release_escrow(cid) == "released"
    rep = v.get_reputation(C.HUNTER)
    assert rep["rewarded"] == 1 and rep["earned"] == 4875
    assert v.balance_of(C.HUNTER) == 50000 + 4875


def test_refunded_hold_is_neutral_on_record(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    cid = _file(direct_vm, v, C.HUNTER, patch="--- patch ---")
    direct_vm.warp("2026-06-01T00:00:00Z")
    _settle(direct_vm, v, cid, C.verdict(cid, C.PINNED, "HoldForPatch", "High"))
    direct_vm.warp("2026-06-10T00:00:00Z")
    direct_vm.sender = _S(C.PROJECT)
    assert v.refund_escrow(cid) == "refunded"
    rep = v.get_reputation(C.HUNTER)
    assert rep["rewarded"] == 0 and rep["rejected"] == 0
    assert v.balance_of(C.HUNTER) == 50000  # bond already returned at hold


def test_merge_returns_both_bonds_and_records_both(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    first = _file(direct_vm, v, C.HUNTER, poc="original report")
    dup = _file(direct_vm, v, C.HUNTER2, poc="later duplicate")
    merged = C.verdict(dup, C.PINNED, "MergeDuplicate", "High",
                       duplicate_of_seq=0, original_bps=7000, duplicate_bps=3000)
    assert _settle(direct_vm, v, dup, merged) == "MergeDuplicate"
    assert v.get_claim(first)["bond_status"] == "returned"
    assert v.get_claim(dup)["bond_status"] == "returned"
    # High 5000 split 7000/3000 bps, 2.5% fee on each part
    assert v.balance_of(C.HUNTER) == 50000 + (3500 - 87)
    assert v.balance_of(C.HUNTER2) == 50000 + (1500 - 37)
    r1 = v.get_reputation(C.HUNTER)
    r2 = v.get_reputation(C.HUNTER2)
    assert r1["rewarded"] == 1 and r1["earned"] == 3413
    assert r2["merged"] == 1 and r2["earned"] == 1463


def test_escalate_returns_bond(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy, critical=True)
    cid = _file(direct_vm, v, C.HUNTER)
    assert _settle(direct_vm, v, cid, C.verdict(cid, C.PINNED, "Escalate", "Critical")) == "Escalate"
    assert v.get_claim(cid)["bond_status"] == "returned"
    assert v.balance_of(C.HUNTER) == 50000
    assert v.get_reputation(C.HUNTER)["escalated"] == 1


def test_project_dismiss_returns_bond_to_researcher(direct_vm, direct_deploy):
    v = _campaign(direct_vm, direct_deploy)
    cid = _file(direct_vm, v, C.HUNTER)
    direct_vm._gl_call_hook = C.make_hook({"get_case_for_claim": ""})
    direct_vm.sender = _S(C.PROJECT)
    project_before = v.balance_of(C.PROJECT)
    v.dismiss_claim(cid)
    assert v.get_claim(cid)["bond_status"] == "returned"
    assert v.balance_of(C.HUNTER) == 50000
    assert v.balance_of(C.PROJECT) == project_before  # the project gains nothing
    assert v.get_reputation(C.HUNTER)["dismissed"] == 1
