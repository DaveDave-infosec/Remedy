import conftest as C
import pytest


def _hold(direct_vm, vault, S):
    direct_vm.sender = S(C.PROJECT)
    vault.faucet(); vault.open_campaign(C.PINNED, 20000, 10000, 5000, 2000, 500, False)
    direct_vm.sender = S(C.HUNTER)
    vault.submit_claim("cam_0", "2026-01-01T00:00:00Z", C.PINNED, "poc", "--- patch ---", "High")
    direct_vm.warp("2026-06-01T00:00:00Z")
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": C.verdict("clm_0", C.PINNED, "HoldForPatch", "High"),
    })
    direct_vm.sender = S(C.BYSTNDR)
    assert vault.settle_claim("clm_0") == "HoldForPatch"
    assert vault.get_claim("clm_0")["status"] == "held"
    assert vault.get_claim("clm_0")["escrowed"] == 5000


def test_release_only_when_fix_verified(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    def S(a): return Address(a)
    _hold(direct_vm, vault, S)

    # not verified yet -> release refused
    direct_vm._gl_call_hook = C.make_hook({"get_fix_result": {"checked": True, "fixed": False, "reasoning": "still broken", "source_hash": "x"}})
    direct_vm.sender = S(C.BYSTNDR)
    with pytest.raises(Exception):
        vault.release_escrow("clm_0")

    # verified -> permissionless release pays the hunter
    direct_vm._gl_call_hook = C.make_hook({"get_fix_result": {"checked": True, "fixed": True, "reasoning": "fixed", "source_hash": "y"}})
    assert vault.release_escrow("clm_0") == "released"
    assert vault.balance_of(C.HUNTER) == 4875
    print("RELEASE GATE OK (blocked until verified, then permissionless)")


def test_refund_project_gated_and_grace(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    def S(a): return Address(a)
    _hold(direct_vm, vault, S)

    direct_vm._gl_call_hook = C.make_hook({"get_fix_result": {"checked": True, "fixed": False, "reasoning": "no fix", "source_hash": "x"}})

    # a non-project wallet cannot refund, even past grace
    direct_vm.warp("2026-07-01T00:00:00Z")
    direct_vm.sender = S(C.BYSTNDR)
    with pytest.raises(Exception):
        vault.refund_escrow("clm_0")

    # project, but grace window not elapsed -> refused
    direct_vm.warp("2026-06-01T01:00:00Z")
    direct_vm.sender = S(C.PROJECT)
    with pytest.raises(Exception):
        vault.refund_escrow("clm_0")

    # project, after the 7-day grace -> refund returns escrow to the pool
    direct_vm.warp("2026-06-10T00:00:00Z")
    assert vault.refund_escrow("clm_0") == "refunded"
    assert vault.get_claim("clm_0")["escrowed"] == 0
    print("REFUND GATE OK (project-only, only after grace, only when not fixed)")