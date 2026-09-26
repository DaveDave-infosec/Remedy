Expected: `43 passed`.

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

### Verdict parsing: tolerant of formatting, strict about content (V3)

Found live: a correct Reject verdict arrived wrapped in a markdown code fence,
and the old parser reverted the whole review on the first backtick. The verifier
now extracts the single JSON object deterministically, refuses any answer it
cannot read without recording anything (so the claim stays reviewable), and
never treats the string "false" as a verified fix.

- `tests/test_verifier_parse.py::test_fenced_verdict_is_parsed`: a verdict wrapped
  in a markdown code fence, the exact live shape, is parsed and recorded.
- `tests/test_verifier_parse.py::test_prose_wrapped_verdict_is_parsed`: a verdict
  with text before and after the JSON is parsed and recorded.
- `tests/test_verifier_parse.py::test_unreadable_verdict_refused_and_claim_stays_reviewable`:
  an answer with no JSON object reverts with a clear message, records no verdict
  and no review lock, and a later review of the same claim succeeds.
- `tests/test_verifier_parse.py::test_unknown_outcome_refused`: a verdict naming an
  outcome outside the five defined ones is refused and nothing is recorded.
- `tests/test_verifier_parse.py::test_verify_fix_fenced_answer_is_parsed`: a fenced
  fix verdict is parsed and bound to the patched artifact.
- `tests/test_verifier_parse.py::test_verify_fix_string_false_is_not_fixed`: a fix
  verdict whose fixed value is the string "false" is recorded as NOT fixed, so it
  can never unlock escrow release.

### Claim bond and researcher reputation (V3)

Submitting a claim locks a bond set by the campaign. The bond comes back on any
credible outcome and on a pre-review dismissal, and is forfeited into the
campaign's bounty pool on Reject, so spam costs the spammer and funds future
bounties. Each bond moves exactly once. Every researcher address carries an
on-chain record updated only by settlement, release, and dismissal. The record
is shown to users but never enters the verdict: claims are judged on evidence,
not on their author.

- `tests/test_bond_reputation.py::test_submit_locks_bond_and_counts`: filing a
  claim locks the campaign bond from the researcher and counts the submission.
- `tests/test_bond_reputation.py::test_bond_requires_balance`: a researcher who
  cannot cover the bond cannot file, and no claim is created.
- `tests/test_bond_reputation.py::test_negative_bond_refused`: a campaign cannot
  be opened with a negative bond.
- `tests/test_bond_reputation.py::test_zero_bond_campaign_needs_no_balance`: a
  campaign may set no bond, and then filing needs no balance.
- `tests/test_bond_reputation.py::test_reject_forfeits_bond_into_pool`: a Reject
  moves the bond into the campaign pool and records the rejection.
- `tests/test_bond_reputation.py::test_reward_returns_bond_and_records_earnings`:
  a Reward returns the bond in full, pays from the schedule, and records the
  earnings.
- `tests/test_bond_reputation.py::test_hold_returns_bond_then_release_records_reward`:
  a HoldForPatch returns the bond at settlement; the reward is only recorded once
  the verified fix releases the escrow.
- `tests/test_bond_reputation.py::test_refunded_hold_is_neutral_on_record`: a held
  claim refunded after the grace window counts as neither rewarded nor rejected,
  since consensus found it credible.
- `tests/test_bond_reputation.py::test_merge_returns_both_bonds_and_records_both`:
  a MergeDuplicate returns both bonds, pays the attribution split, and records the
  first reporter as rewarded and the later one as merged.
- `tests/test_bond_reputation.py::test_escalate_returns_bond`: an Escalate returns
  the bond and records the escalation.
- `tests/test_bond_reputation.py::test_project_dismiss_returns_bond_to_researcher`:
  when the project dismisses an unreviewed claim, the bond goes back to the
  researcher and the project gains nothing.

### Settlement bindings (steward round)

Three bindings that a verdict alone must never be trusted to get right: a fix
verdict belongs to one claim judging one artifact, a duplicate must point
backward at a claim on the same target, and a campaign can only be escalated if
the project flagged it critical. Each is enforced in the vault or the verifier,
not in the prompt.

- `tests/test_steward_binding.py::test_fix_verdict_is_per_claim_not_per_artifact`:
  a fix verdict is keyed by claim and artifact together, so a second claim that
  submits the same artifact has no verdict until it is judged on its own, and a
  repeat for the same pair is still refused.
- `tests/test_steward_binding.py::test_release_refuses_another_claims_verdict`: a
  held claim cannot release escrow on a fix verdict produced for a different
  claim, even when both submitted the identical artifact.
- `tests/test_steward_binding.py::test_merge_refuses_a_later_claim_as_the_original`:
  a duplicate that names a LATER claim as its original is refused, so merge
  attribution cannot run backward.
- `tests/test_steward_binding.py::test_merge_refuses_an_original_on_another_target`:
  a duplicate that names a claim on a different target is refused, since
  duplicate detection is scoped per target.
- `tests/test_steward_binding.py::test_escalate_refused_on_a_non_critical_campaign`:
  an Escalate verdict against a campaign that is not flagged critical is refused,
  the campaign stays active, and the claim stays open.

## Harness note

The two contracts call each other (`gl.get_contract_at(...).view(...)`). The direct
runner hosts one contract per test, so each test deploys the contract under test and
answers the other side's calls through the runner's cross-contract hook. This keeps
the real contract code on the executing path while making each guard deterministic.
The multi-target tests need no mock at all: every method they exercise is pure vault
logic.
