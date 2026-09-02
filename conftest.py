import os
import sys
import pytest

# --- Windows gltest loader shim (harmless on Linux; needed on Windows) ---
if os.name == "nt":
    _real_unlink = os.unlink
    def _safe_unlink(path, *a, **k):
        try:
            return _real_unlink(path, *a, **k)
        except PermissionError:
            return None
    os.unlink = _safe_unlink

SDK = "v0.2.16"
OWNER   = "0x1111111111111111111111111111111111111111"
FEEWALL = "0x1111111111111111111111111111111111111111"
PROJECT = "0x2222222222222222222222222222222222222222"
HUNTER  = "0x3333333333333333333333333333333333333333"
HUNTER2 = "0x5555555555555555555555555555555555555555"
BYSTNDR = "0x4444444444444444444444444444444444444444"
DUMMY_VERIFIER = "0x9999999999999999999999999999999999999999"
DUMMY_VAULT    = "0x8888888888888888888888888888888888888888"
FEE_BPS = 250

PINNED = ("https://raw.githubusercontent.com/DaveDave-infosec/Credence/"
          "3f2a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a/CredencePayout.sol")
BRANCH = ("https://raw.githubusercontent.com/DaveDave-infosec/Credence/"
          "main/CredencePayout.sol")


def make_hook(responses, prompt=None):
    """responses: {method_name: value or callable(cc)->value} for cross-contract views.
    prompt: if set, the string returned for an eq_principle ExecPromptTemplate (the LLM).
    Both results use the sub-VM formats the SDK expects."""
    def hook(vm, request):
        from genlayer.py import calldata
        if "CallContract" in request:
            cc = request["CallContract"]
            method = cc["calldata"]["method"]
            if method in responses:
                val = responses[method]
                if callable(val):
                    val = val(cc)
                return bytes([0]) + calldata.encode(val)
        if "ExecPromptTemplate" in request and prompt is not None:
            # _decode_nondet does: ret = calldata.decode(buf); return ret["ok"]
            return calldata.encode({"ok": prompt})
        return None
    return hook


@pytest.fixture(autouse=True)
def _warp_datetime_shim():
    """direct_vm.warp() sets vm._datetime but not gl.message_raw['datetime'];
    the contracts read the latter for the consensus clock. Patch warp to set both."""
    try:
        from gltest.direct.vm import VMContext
    except Exception:
        yield
        return
    orig = VMContext.warp
    def patched(self, ts, *a, **k):
        res = orig(self, ts, *a, **k)
        try:
            mod = sys.modules.get("genlayer.gl")
            if mod is not None and hasattr(mod, "message_raw") and mod.message_raw is not None:
                mod.message_raw["datetime"] = ts
        except Exception:
            pass
        return res
    VMContext.warp = patched
    yield
    VMContext.warp = orig


def verdict(claim_id, target, outcome, severity, **over):
    v = {
        "case_id": "remedy_0", "claim_id": claim_id, "target_url": target,
        "claimed_severity": severity, "outcome": outcome, "severity": severity,
        "payout": 999999, "patch_assessment": "none submitted",
        "reasoning": "reasoning grounded in code", "minority_note": "a dissenting view",
        "is_duplicate": (outcome == "MergeDuplicate"), "duplicate_of_seq": -1,
        "original_bps": 10000, "duplicate_bps": 0, "source_hash": "abc123",
    }
    v.update(over)
    return v



# distinct commit-pinned patched artifacts (different 40-hex SHAs than PINNED)
PATCHED = ("https://raw.githubusercontent.com/DaveDave-infosec/Credence/"
           "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678/CredencePayout.sol")
PATCHED2 = ("https://raw.githubusercontent.com/DaveDave-infosec/Credence/"
            "0011223344556677889900aabbccddeeff001122/CredencePayout.sol")
