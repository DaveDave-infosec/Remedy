"""
Pillar 1 (V3): multi-target campaigns.

Proves, on the direct runner against the real vault code path:
- open_campaign accepts a LIST of commit-pinned targets (the one input shape
  never used before in this codebase; exercised through the calldata roundtrip)
- the target-set validation (empty / branch / duplicate / over-cap) reverts
- submit_claim binds a claim to a target BY INDEX, resolving the URL canonically
- an out-of-range index reverts
- get_priors_json scopes duplicate priors PER TARGET (claims on different
  contracts of the same campaign never see each other as priors)

No cross-contract call and no web/LLM mock is needed: every method exercised
here is pure vault logic.
"""
import json
import pytest
from conftest import (
    SDK, OWNER, FEEWALL, PROJECT, HUNTER, FEE_BPS, DUMMY_VERIFIER,
    PINNED, BRANCH, PATCHED, PATCHED2,
)

VAULT = "contracts/remedy_vault.py"
AT = "2026-01-01T00:00:00Z"


def _addr(hexstr):
    from genlayer.py.types import Address
    return Address(hexstr)


def _mk(sha):
    return ("https://raw.githubusercontent.com/DaveDave-infosec/Credence/"
            + sha + "/CredencePayout.sol")


def _deploy_and_fund(direct_deploy, direct_vm):
    c = direct_deploy(VAULT, OWNER, FEEWALL, FEE_BPS, DUMMY_VERIFIER, sdk_version=SDK)
    direct_vm.sender = _addr(PROJECT)
    c.faucet()  # PROJECT gets 50000 GenUSDC
    return c


def test_open_campaign_accepts_target_list(direct_deploy, direct_vm):
    c = _deploy_and_fund(direct_deploy, direct_vm)
    cid = c.open_campaign([PINNED, PATCHED], 20000, 10000, 5000, 2000, 500, False, 0)
    assert cid == "cam_0"
    camp = c.get_campaign("cam_0")
    assert camp["targets"] == [PINNED, PATCHED]
    assert camp["target_count"] == 2
    assert camp["status"] == "active"


def test_open_campaign_rejects_bad_target_sets(direct_deploy, direct_vm):
    c = _deploy_and_fund(direct_deploy, direct_vm)

    with direct_vm.expect_revert("at least one target"):
        c.open_campaign([], 1000, 1, 1, 1, 1, False, 0)

    with direct_vm.expect_revert("commit-pinned"):
        c.open_campaign([BRANCH], 1000, 1, 1, 1, 1, False, 0)

    with direct_vm.expect_revert("duplicate target"):
        c.open_campaign([PINNED, PINNED], 1000, 1, 1, 1, 1, False, 0)

    eleven = [_mk("%040x" % i) for i in range(11)]
    with direct_vm.expect_revert("at most"):
        c.open_campaign(eleven, 1000, 1, 1, 1, 1, False, 0)

    assert c.get_campaign_count() == 0


def test_submit_claim_binds_target_by_index(direct_deploy, direct_vm):
    c = _deploy_and_fund(direct_deploy, direct_vm)
    c.open_campaign([PINNED, PATCHED], 20000, 10000, 5000, 2000, 500, False, 0)

    direct_vm.sender = _addr(HUNTER)
    clm0 = c.submit_claim("cam_0", AT, 0, "poc against target 0", "", "High")
    cl0 = c.get_claim(clm0)
    assert cl0["target_url"] == PINNED
    assert cl0["target_index"] == 0

    clm1 = c.submit_claim("cam_0", AT, 1, "poc against target 1", "", "High")
    cl1 = c.get_claim(clm1)
    assert cl1["target_url"] == PATCHED
    assert cl1["target_index"] == 1


def test_submit_claim_rejects_out_of_range_index(direct_deploy, direct_vm):
    c = _deploy_and_fund(direct_deploy, direct_vm)
    c.open_campaign([PINNED, PATCHED], 20000, 10000, 5000, 2000, 500, False, 0)

    direct_vm.sender = _addr(HUNTER)
    with direct_vm.expect_revert("out of range"):
        c.submit_claim("cam_0", AT, 2, "poc", "", "High")


def test_priors_are_scoped_per_target(direct_deploy, direct_vm):
    c = _deploy_and_fund(direct_deploy, direct_vm)
    c.open_campaign([PINNED, PATCHED], 20000, 10000, 5000, 2000, 500, False, 0)

    direct_vm.sender = _addr(HUNTER)
    clm0 = c.submit_claim("cam_0", AT, 0, "poc A on target 0", "", "High")   # target 0
    clm1 = c.submit_claim("cam_0", AT, 1, "poc B on target 1", "", "High")   # target 1
    clm2 = c.submit_claim("cam_0", AT, 0, "poc C on target 0", "", "High")   # target 0

    p2 = {p["claim_id"] for p in json.loads(c.get_priors_json("cam_0", clm2))}
    assert p2 == {clm0}

    p0 = {p["claim_id"] for p in json.loads(c.get_priors_json("cam_0", clm0))}
    assert p0 == {clm2}

    p1 = json.loads(c.get_priors_json("cam_0", clm1))
    assert p1 == []
