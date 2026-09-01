import conftest as C


def test_reject_pays_nothing(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    def S(a): return Address(a)
    direct_vm.sender = S(C.PROJECT)
    vault.faucet(); vault.open_campaign(C.PINNED, 20000, 10000, 5000, 2000, 500, False)
    direct_vm.sender = S(C.HUNTER)
    vault.submit_claim("cam_0", "2026-01-01T00:00:00Z", C.PINNED, "false claim", "", "Critical")
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": C.verdict("clm_0", C.PINNED, "Reject", "None"),
    })
    direct_vm.sender = S(C.BYSTNDR)
    assert vault.settle_claim("clm_0") == "Reject"
    assert vault.balance_of(C.HUNTER) == 0
    assert vault.get_claim("clm_0")["status"] == "rejected"
    assert vault.get_campaign("cam_0")["pool"] == 20000
    print("REJECT OK (no payout, pool intact)")


def test_reward_value_conservation(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    def S(a): return Address(a)
    direct_vm.sender = S(C.PROJECT)
    vault.faucet(); vault.open_campaign(C.PINNED, 20000, 10000, 5000, 2000, 500, False)
    direct_vm.sender = S(C.HUNTER)
    vault.submit_claim("cam_0", "2026-01-01T00:00:00Z", C.PINNED, "poc", "", "Critical")
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": C.verdict("clm_0", C.PINNED, "Reward", "Critical"),
    })
    direct_vm.sender = S(C.BYSTNDR)
    vault.settle_claim("clm_0")
    hunter = vault.balance_of(C.HUNTER)
    fee = vault.balance_of(C.FEEWALL)
    spent = 20000 - vault.get_campaign("cam_0")["pool"]
    assert hunter == 9750 and fee == 250
    assert spent == hunter + fee == 10000
    print("VALUE CONSERVATION OK")