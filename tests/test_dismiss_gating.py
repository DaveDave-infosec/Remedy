import conftest as C
import pytest


def test_dismiss_blocked_when_verdict_exists(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    def S(a): return Address(a)

    direct_vm.sender = S(C.PROJECT)
    vault.faucet(); vault.open_campaign(C.PINNED, 20000, 10000, 5000, 2000, 500, False)
    direct_vm.sender = S(C.HUNTER)
    vault.submit_claim("cam_0", "2026-01-01T00:00:00Z", C.PINNED, "poc", "", "High")

    # a verdict EXISTS for the claim -> dismiss must be refused
    direct_vm._gl_call_hook = C.make_hook({"get_case_for_claim": "remedy_0"})
    direct_vm.sender = S(C.PROJECT)
    with pytest.raises(Exception):
        vault.dismiss_claim("clm_0")
    assert vault.get_claim("clm_0")["status"] == "open"

    # no verdict yet -> an open claim can still be dismissed
    direct_vm._gl_call_hook = C.make_hook({"get_case_for_claim": ""})
    vault.dismiss_claim("clm_0")
    assert vault.get_claim("clm_0")["status"] == "dismissed"
    print("DISMISS GATING OK (verdict-bound refused, un-reviewed allowed)")