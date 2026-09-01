import conftest as C


def test_permissionless_bystander_settle_reward(direct_vm, direct_deploy):
    vault = direct_deploy("contracts/remedy_vault.py", C.OWNER, C.FEEWALL, C.FEE_BPS, C.DUMMY_VERIFIER, sdk_version=C.SDK)
    from genlayer.py.types import Address
    def S(a): return Address(a)

    direct_vm.sender = S(C.PROJECT)
    vault.faucet()
    vault.open_campaign(C.PINNED, 20000, 10000, 5000, 2000, 500, False)

    direct_vm.sender = S(C.HUNTER)
    vault.submit_claim("cam_0", "2026-01-01T00:00:00Z", C.PINNED, "unchecked call", "", "High")

    # the verifier says High Reward; verdict.payout is absurd on purpose
    direct_vm._gl_call_hook = C.make_hook({
        "get_case_for_claim": "remedy_0",
        "get_verdict": C.verdict("clm_0", C.PINNED, "Reward", "High"),
    })

    # a wallet with NO connection to the campaign settles it
    direct_vm.sender = S(C.BYSTNDR)
    assert vault.settle_claim("clm_0") == "Reward"

    # payout came from the vault's OWN schedule (High=5000 - 2.5% fee), NOT the verdict's 999999
    assert vault.balance_of(C.HUNTER) == 4875
    assert vault.get_claim("clm_0")["status"] == "rewarded"
    assert vault.get_campaign("cam_0")["pool"] == 15000
    print("PERMISSIONLESS BYSTANDER SETTLE + SCHEDULE-RECOMPUTE OK")