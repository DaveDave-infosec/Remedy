# Testing

Remedy ships a real-contract test suite that exercises the deployed contract code
directly. The tests drive the actual `contracts/remedy_verifier.py` and
`contracts/remedy_vault.py` paths on GenLayer's `gltest` direct runner; only the
cross-contract dependency (the other contract's view responses) and the model
verdict are mocked, so every guard runs for real. No skipped tests.

## Run

```
pip install "genlayer-test[sim]"
pytest tests/ -q
```

Expected: `16 passed`.

## What each test proves

The suite maps directly onto the review items and the trust model.

### Commit-pinned, complete, immutable source

- `tests/test_pin.py` � `open_campaign` accepts a commit-pinned raw GitHub URL
  (40-char SHA) and rejects a branch URL, a short/invalid SHA, a non-raw URL, and a
  prefix-spoofed URL. A mutable target cannot enter the system.
- `tests/test_verifier_source.py::test_source_hash_recorded` � the sha256 of the
  exact bytes consensus judged is recorded on the verdict.
- `tests/test_verifier_source.py::test_oversize_source_refused` � a source over the
  size limit is refused, never truncated and judged on a partial file.

### One authorized review per claim

- `tests/test_verifier_source.py::test_one_review_per_claim` � a second `run_review`
  on the same claim reverts. Verdict-shopping is closed.

### Dismiss cannot discard a verdict-bound claim

- `tests/test_dismiss_gating.py` � once the verifier holds a verdict for a claim,
  `dismiss_claim` reverts; an un-reviewed open claim can still be dismissed.

### Held escrow cannot be reclaimed unilaterally

- `tests/test_escrow_completion.py::test_release_only_when_fix_verified` � escrow is
  released only after the verifier's re-review confirms the fix, and release is
  permissionless.
- `tests/test_escrow_completion.py::test_refund_project_gated_and_grace` � a refund
  requires all of: the campaign project as sender, a proven failed fix, and the
  grace window elapsed. A non-project caller, a too-early attempt, and an unverified
  state are each refused.

### Trustless settlement

- `tests/test_settle_bystander.py` � a wallet with no connection to the campaign
  settles a claim (permissionless), and the payout is recomputed from the vault's
  own on-chain schedule, not from any number the verdict carries.
- `tests/test_settle_outcomes.py::test_reject_pays_nothing` � a Reject moves no funds.
- `tests/test_settle_outcomes.py::test_reward_value_conservation` � a Reward
  conserves value exactly: pool decrease equals net payout plus protocol fee.

### Patch flow: a fix is its own immutable, commit-pinned artifact

A held claim is resolved by submitting a NEW commit-pinned patched artifact (a
different commit that contains the fix), which the verifier judges once and
binds the result to. Repeating the same evidence cannot overwrite a verdict.

- `tests/test_patch_flow.py::test_verify_fix_against_unchanged_original_is_not_fixed`
  — verifying against the unchanged original artifact returns not-fixed.
- `tests/test_patch_flow.py::test_verify_fix_against_distinct_patched_artifact_is_fixed`
  — verifying against a distinct patched artifact returns fixed, and the verdict
  binds to the sha256 of that exact artifact.
- `tests/test_patch_flow.py::test_same_artifact_cannot_be_reverified` — the same
  patched artifact cannot be re-verified; its verdict is immutable.
- `tests/test_patch_flow.py::test_distinct_artifact_gets_fresh_verdict_prior_stays_immutable`
  — a genuinely different patched artifact gets a fresh verdict while the prior
  one stays immutable.
- `tests/test_patch_flow.py::test_verify_fix_requires_a_submitted_artifact` —
  verify_fix reverts if no patched artifact has been submitted.
- `tests/test_escrow_completion.py::test_release_needs_submitted_artifact_then_verified`
  — release requires a submitted artifact and only pays once its verdict is fixed;
  a branch (mutable) patched URL is rejected.
- `tests/test_escrow_completion.py::test_refund_blocked_when_fix_verified` — a
  verified fix must be released to the submitter, never refunded away.

## Harness note

The two contracts call each other (`gl.get_contract_at(...).view(...)`). The direct
runner hosts one contract per test, so each test deploys the contract under test and
answers the other side's calls through the runner's cross-contract hook. This keeps
the real contract code on the executing path while making each guard deterministic.