Expected: `21 passed`.

## What each test proves

The suite maps directly onto the review items and the trust model.

### Commit-pinned, complete, immutable source

- `tests/test_pin.py`: `open_campaign` accepts a commit-pinned raw GitHub URL
  (40-char SHA) and rejects a branch URL, a short/invalid SHA, a non-raw URL, and a
  prefix-spoofed URL. The check applies to every target in a campaign's target set,
  so a mutable target cannot enter the system.
- `tests/test_verifier_source.py::test_source_hash_recorded`: the sha256 of the
  exact bytes consensus judged is recorded on the verdict.
- `tests/test_verifier_source.py::test_oversize_source_refused`: a source over the
  size limit is refused, never truncated and judged on a partial file.

### One authorized review per claim

- `tests/test_verifier_source.py::test_one_review_per_claim`: a second `run_review`
  on the same claim reverts. Verdict-shopping is closed.

### Dismiss cannot discard a verdict-bound claim

- `tests/test_dismiss_gating.py`: once the verifier holds a verdict for a claim,
  `dismiss_claim` reverts; an un-reviewed open claim can still be dismissed.

### Held escrow cannot be reclaimed unilaterally

- `tests/test_escrow_completion.py::test_refund_project_gated_and_grace`: a refund
  requires all of: the campaign project as sender, a submitted artifact whose fix
  verdict is not-fixed, and the grace window elapsed. A non-project caller, a
  too-early attempt, and a verified-fixed state are each refused.
- Release of held escrow is covered in the patch-flow section below: it is
  permissionless and pays only once the submitted artifact is verified fixed.

### Trustless settlement

- `tests/test_settle_bystander.py`: a wallet with no connection to the campaign
  settles a claim (permissionless), and the payout is recomputed from the vault's
  own on-chain schedule, not from any number the verdict carries.
- `tests/test_settle_outcomes.py::test_reject_pays_nothing`: a Reject moves no funds.
- `tests/test_settle_outcomes.py::test_reward_value_conservation`: a Reward
  conserves value exactly: pool decrease equals net payout plus protocol fee.

### Patch flow: a fix is its own immutable, commit-pinned artifact

A held claim is resolved by submitting a NEW commit-pinned patched artifact (a
different commit that contains the fix), which the verifier judges once and
binds the result to. Repeating the same evidence cannot overwrite a verdict.

- `tests/test_patch_flow.py::test_verify_fix_against_unchanged_original_is_not_fixed`:
  verifying against the unchanged original artifact returns not-fixed.
- `tests/test_patch_flow.py::test_verify_fix_against_distinct_patched_artifact_is_fixed`:
  verifying against a distinct patched artifact returns fixed, and the verdict
  binds to the sha256 of that exact artifact.
- `tests/test_patch_flow.py::test_same_artifact_cannot_be_reverified`: the same
  patched artifact cannot be re-verified; its verdict is immutable.
- `tests/test_patch_flow.py::test_distinct_artifact_gets_fresh_verdict_prior_stays_immutable`:
  a genuinely different patched artifact gets a fresh verdict while the prior
  one stays immutable.
- `tests/test_patch_flow.py::test_verify_fix_requires_a_submitted_artifact`:
  verify_fix reverts if no patched artifact has been submitted.
- `tests/test_escrow_completion.py::test_release_needs_submitted_artifact_then_verified`:
  release is permissionless, requires a submitted artifact, and only pays once its
  verdict is fixed; a branch (mutable) patched URL is rejected.
- `tests/test_escrow_completion.py::test_refund_blocked_when_fix_verified`: a
  verified fix must be released to the submitter, never refunded away.

### Multi-target campaigns (V3)

A campaign covers a set of up to 10 commit-pinned target contracts (for example a
token, a vault, and a router). A claim names its target by index; the vault
resolves the URL itself, so a caller never supplies a URL. Duplicate detection is
scoped per target, so claims against different contracts of the same campaign are
never treated as duplicates of each other.

- `tests/test_multitarget.py::test_open_campaign_accepts_target_list`: a campaign
  opens with a list of commit-pinned targets and exposes them in order, with their
  count.
- `tests/test_multitarget.py::test_open_campaign_rejects_bad_target_sets`: an empty
  set, a branch URL, a repeated URL, and more than 10 targets are each refused, and
  no refused attempt consumes a campaign id.
- `tests/test_multitarget.py::test_submit_claim_binds_target_by_index`: a claim filed
  with index 0 or index 1 is bound to exactly that target's URL, resolved by the
  vault.
- `tests/test_multitarget.py::test_submit_claim_rejects_out_of_range_index`: an index
  outside the campaign's target set reverts.
- `tests/test_multitarget.py::test_priors_are_scoped_per_target`: the prior claims
  handed to the verifier for its duplicate check contain only claims on the same
  target; a claim on another contract of the same campaign never appears.

## Harness note

The two contracts call each other (`gl.get_contract_at(...).view(...)`). The direct
runner hosts one contract per test, so each test deploys the contract under test and
answers the other side's calls through the runner's cross-contract hook. This keeps
the real contract code on the executing path while making each guard deterministic.
The multi-target tests need no mock at all: every method they exercise is pure vault
logic.
