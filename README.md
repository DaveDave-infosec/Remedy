# Remedy

**Consensus security settlement on GenLayer.** Researchers file smart-contract vulnerability claims; GenLayer validators judge them by consensus, and a permissionless vault settles the bounty on the verdict alone. No committee, no relay, no trusted human in the loop.

Live: https://remedy-genlayer.vercel.app
Network: GenLayer Studio (chainId 61999)

---

## The problem

When a researcher discloses a flaw, a human normally decides four things: whether it is real, how severe it is, whether it duplicates an earlier report, and what it pays. Every one of those calls is a trusted intermediary, and a point of bias, delay, and dispute. The researcher hopes the project pays fairly; the project hopes the claim is honest; nobody can prove the decision was neutral.

Remedy removes the human from all four. Validators read the locked evidence, reach consensus, and the vault settles itself.

## How it works

A project opens a **security campaign**: a bounty pool locked against a set of up to 10 commit-pinned target contracts (for example a token, a vault, and a router), with one severity-to-payout schedule for the whole program. Researchers submit claims over time. Each claim names which target it is filed against and locks its evidence at intake (proof-of-concept text, optional patch diff, claimed severity); nothing can be edited or backdated after submission.

When a review runs, the verifier reads the claim straight from the vault, fetches that claim's target source, and reasons over it, then reaches consensus on one of five outcomes:

| Outcome | Meaning |
| --- | --- |
| **Reward** | Credible and novel. The bounty pays out to the researcher. |
| **Reject** | Not credible on the evidence. No payout, reasoning on record. |
| **HoldForPatch** | Credible, with a fix attached. The reward escrows until a patched artifact is verified. |
| **MergeDuplicate** | Overlaps an earlier claim on the same target. The bounty splits by attribution, weighted to the first reporter. |
| **Escalate** | A credible Critical on a flagged target. The campaign pauses for review. |

## Multi-target campaigns

Real protocols are several contracts, and real bugs live in one of them. A campaign therefore covers a set of targets, and every claim is bound to exactly one:

- The researcher picks a target by its index in the campaign. The vault resolves the URL itself from its own storage, so a caller never supplies a URL and cannot point a claim at anything the campaign did not list.
- Every target in the set must be commit-pinned, the set holds 1 to 10 targets, and a repeated URL is refused.
- Duplicate detection is scoped per target. Two claims against different contracts of the same campaign are never treated as duplicates of each other; two claims against the same contract still can be.

## Trustless settlement

This is the core of Remedy. `settle_claim` on the vault is **permissionless**: anyone can call it, and the caller supplies no numbers. The vault asks the verifier for the one verdict bound to the claim, checks that the verdict's claim and target match the claim, and takes the outcome and the consensus severity from it. The payout is then recomputed from the vault's **own** on-chain schedule for that severity. Any payout figure the verdict carries is ignored, so neither a caller nor the model can inflate what is paid.

To prove there is no privileged relay, a wallet with no connection to the campaign settled a bounty on-chain, and the vault derived the outcome and amount itself. This receipt is from the V2 deployment; the settlement path is unchanged since:

Receipt: https://explorer-studio.genlayer.com/tx/0xee0e886feebf45b6de68f00bc18a6e10ade17d00a9a491bbdd77c64c3c32cb69

## Evidence that cannot move

- **Commit-pinned sources.** Targets must be raw GitHub URLs pinned to a 40-character commit SHA. Branch URLs, short or invalid SHAs, non-raw URLs, and prefix spoofs are refused, because a branch can change after a claim is filed.
- **Complete sources, hashed.** The verifier judges the whole file or nothing: a source over 24000 bytes is refused, never truncated. The sha256 of the exact bytes consensus judged is written onto the verdict, so any later drift is provable.
- **One review per claim.** A claim gets exactly one authorized review. A second `run_review` reverts, so nobody can shop for a better verdict.
- **Verdict-bound claims cannot be dismissed.** Once a verdict exists, `dismiss_claim` reverts; the claim must be settled.
- **Spam has a price.** Filing a claim locks a bond set by the campaign. It comes back on any credible outcome and on a pre-review dismissal, and is forfeited into the bounty pool on Reject. Every researcher address carries an on-chain record of rewarded, merged, rejected and earned, shown to readers but never fed to the verifier: claims are judged on evidence, not on their author.
- **Verdicts are read strictly.** The verifier extracts the one JSON verdict from the consensus answer even when it arrives fenced or wrapped in text, and refuses anything unreadable, incomplete, or naming an unknown outcome without recording it. A fix verdict counts only as a real true or false.

## The patch flow

A HoldForPatch claim is completed with evidence, not discretion:

1. The researcher or the project submits a **new** commit-pinned patched artifact (`submit_fix`).
2. `verify_fix` fetches that artifact, judges whether the original flaw is closed, and stores one immutable verdict for it, bound to the artifact's sha256. The same artifact can never be judged twice; a genuinely different artifact gets its own fresh verdict.
3. `release_escrow` is permissionless and pays the researcher only when the submitted artifact's verdict is fixed.
4. `refund_escrow` returns escrow to the pool only if the project calls it, the submitted artifact is not verified fixed, and a 7-day grace window has passed. A verified fix can never be refunded away.

## Disagreement is signal

Every verdict carries a minority_note: the strongest dissenting view, produced by the same consensus that set the outcome and written on-chain alongside the verdict. It is one dissenting view per verdict, produced in consensus, not a tally of individual validators.

## Architecture

Two Python Intelligent Contracts on GenLayer Studio:

- **Verifier** (`0x4712c4165eFaf8CCd8F0371E7821ed729c872569`) reads claims, campaigns, and same-target prior claims canonically from the vault, fetches the target source with `gl.nondet.web.get` inside `gl.eq_principle.strict_eq`, reasons via `gl.eq_principle.prompt_non_comparative`, and stores one structured verdict per claim. It also judges submitted patched artifacts. It produces verdicts only and never touches funds.
- **Vault** (`0x60c5C00b46a0845A11E5a1D5Cf22a1607E55e994`) embeds the GenUSDC settlement token, holds bounty pools, records multi-target campaigns and claims, and settles, releases, and refunds by reading the verifier directly. Privileged actions use the real transaction sender; there is no spoofable caller parameter. `mint` is owner-gated for demos; a public capped `faucet` grants each address a one-time 50000 test allowance.

Explorer:
- Verifier: https://explorer-studio.genlayer.com/address/0x4712c4165eFaf8CCd8F0371E7821ed729c872569
- Vault: https://explorer-studio.genlayer.com/address/0x60c5C00b46a0845A11E5a1D5Cf22a1607E55e994

Frontend: React + TypeScript + Vite + genlayer-js, deployed on Vercel. Wallet support is MetaMask plus a demo burner fallback.

## The app

The app is the protocol, not a brochure for it. Everything below is read from the
two contracts at the addresses above; nothing is mocked.

- The landing page runs a real claim through the settlement path: the severity
  seal flips from the researcher's claimed grade to the one consensus assigned,
  the minority note appears beside it, and the settlement hash types itself out.
- Opening a campaign takes a set of commit-pinned targets, a pool, and the claim
  bond. The severity schedule is set per campaign and is what the vault pays from.
- The campaign view carries live figures for every pool: locked, held in escrow,
  and paid to researchers, with a meter on each campaign card showing the split.
- Each claim card shows its target, its bond state (locked, returned, or
  forfeited to the pool), the submitter's on-chain record, the consensus verdict
  with its reasoning, and the minority view recorded beside it.
- A held claim takes a new commit-pinned patched artifact, and once consensus has
  judged that artifact the card shows the fix verdict, bound to the sha256 of the
  exact bytes judged, with the escrow released only when it reads as fixed.
- Demo mode gives a throwaway wallet and a faucet, so the full loop can be driven
  without MetaMask or anything of value.

## Tested

**Contract test suite.** 38 tests run the real contract code on GenLayer's `gltest` direct runner, with no skips; only the other contract's replies and the model verdict are mocked. [TESTING.md](TESTING.md) maps every test to the guarantee it proves.

    pip install "genlayer-test[sim]"
    python -m pytest tests/ -q

**Live reviews.** Proven on-chain across two vulnerability classes on two targets:

- **VulnBank.sol** (reentrancy)
- **CredencePayout.sol** (unchecked external-call return value)

On CredencePayout the verifier rewarded the real unchecked-call bug, rejected a false reentrancy claim by reasoning about checks-effects-interactions ordering, rejected a false access-control claim by quoting the actual guard in the code, and held a patched claim in escrow at a nuanced Medium severity. That held claim was then completed through the patch flow: a separate commit containing the fix was submitted, `verify_fix` judged it fixed by citing the added check, and the escrow was released. It reasons over the specific code; it does not pattern-match.

## Scope and honest limitations

- Remedy verifies security-claim credibility from readable evidence. It does **not** execute exploits: validators reason over the contract source, the proof-of-concept as written, and the patch diff. This is a credibility verdict from static evidence, not a proof of execution.
- Remedy covers smart-contract security claims that are statically judgeable from readable code, PoC, and diffs. Exploits needing live execution are out of scope.
- Each claim is judged against one target. A bug that only appears in the interaction between two contracts must currently be filed against the contract where the flaw lives, with the other contract described in the PoC.
- Each reviewed source must fit in 24000 bytes; larger files are refused rather than judged partially.
- The verifier reasons over readable source in any language, but verdict quality is strongest for well-documented contract languages, Solidity most of all.
- Reviews are triggered manually; there is no automatic scheduler yet.
- GenUSDC is an embedded testnet token with no real value. A production deployment would use a real bridged asset.
- A project can submit a claim on its own campaign. This is economically pointless: the pool is the project's own funds, so a self-payout only returns their deposit minus the protocol fee. It also cannot be cleanly prevented on-chain, since a project could fund from one wallet and submit from another. Credibility is still decided by consensus, so a project cannot force a payout on a claim that is not genuine.

## Run it

    cd frontend
    npm install
    npm run dev

Then open the local URL. Use Demo mode for a throwaway wallet and click the faucet for test funds; no MetaMask or real crypto required. Open a campaign with one or more targets, submit a claim against a target, run the review, and settle it to watch the full loop.

## Links

- Live app: https://remedy-genlayer.vercel.app
- Test map: [TESTING.md](TESTING.md)
- Settlement receipt: https://explorer-studio.genlayer.com/tx/0xee0e886feebf45b6de68f00bc18a6e10ade17d00a9a491bbdd77c64c3c32cb69
