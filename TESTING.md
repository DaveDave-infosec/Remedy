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

Expected: `10 passed`.

## What each test proves

The suite maps directly onto the review items and the trust model.

### Commit-pinned, complete, immutable source

- `tests/test_pin.py` — `open_campaign` accepts a commit-pinned raw GitHub URL
  (40-char SHA) and rejects a branch URL, a short/invalid SHA, a non-raw URL, and a
  prefix-spoofed URL. A mutable target cannot enter the system.
- `tests/test_verifier_source.py::test_source_hash_recorded` — the sha256 of the
  exact bytes consensus judged is recorded on the verdict.
- `tests/test_verifier_source.py::test_oversize_source_refused` — a source over the
  size limit is refused, never truncated and judged on a partial file.

### One authorized review per claim

- `tests/test_verifier_source.py::test_one_review_per_claim` — a second `run_review`
  on the same claim reverts. Verdict-shopping is closed.

### Dismiss cannot discard a verdict-bound claim

- `tests/test_dismiss_gating.py` — once the verifier holds a verdict for a claim,
  `dismiss_claim` reverts; an un-reviewed open claim can still be dismissed.

### Held escrow cannot be reclaimed unilaterally

- `tests/test_escrow_completion.py::test_release_only_when_fix_verified` — escrow is
  released only after the verifier's re-review confirms the fix, and release is
  permissionless.
- `tests/test_escrow_completion.py::test_refund_project_gated_and_grace` — a refund
  requires all of: the campaign project as sender, a proven failed fix, and the
  grace window elapsed. A non-project caller, a too-early attempt, and an unverified
  state are each refused.

### Trustless settlement

- `tests/test_settle_bystander.py` — a wallet with no connection to the campaign
  settles a claim (permissionless), and the payout is recomputed from the vault's
  own on-chain schedule, not from any number the verdict carries.
- `tests/test_settle_outcomes.py::test_reject_pays_nothing` — a Reject moves no funds.
- `tests/test_settle_outcomes.py::test_reward_value_conservation` — a Reward
  conserves value exactly: pool decrease equals net payout plus protocol fee.

## Harness note

The two contracts call each other (`gl.get_contract_at(...).view(...)`). The direct
runner hosts one contract per test, so each test deploys the contract under test and
answers the other side's calls through the runner's cross-contract hook. This keeps
the real contract code on the executing path while making each guard deterministic.