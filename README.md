# Remedy

**Consensus security settlement on GenLayer.** Researchers file smart-contract vulnerability claims; GenLayer validators judge them by consensus, and a permissionless vault settles the bounty on the verdict alone. No committee, no relay, no trusted human in the loop.

Live: [LIVE APP URL]
Network: GenLayer Studio (chainId 61999)

---

## The problem

When a researcher discloses a flaw, a human normally decides four things: whether it is real, how severe it is, whether it duplicates an earlier report, and what it pays. Every one of those calls is a trusted intermediary, and a point of bias, delay, and dispute. The researcher hopes the project pays fairly; the project hopes the claim is honest; nobody can prove the decision was neutral.

Remedy removes the human from all four. Validators read the locked evidence, reach consensus, and the vault settles itself.

## How it works

A project opens a **security campaign**: a bounty pool locked against a target contract, with a severity-to-payout schedule. Researchers submit claims over time. Each claim locks its evidence at intake (target source URL, proof-of-concept text, optional patch diff, claimed severity); nothing can be edited or backdated after submission.

When a review runs, the verifier fetches the locked evidence and reasons over it, then reaches consensus on one of five outcomes:

| Outcome | Meaning |
| --- | --- |
| **Reward** | Credible and novel. The bounty pays out to the researcher. |
| **Reject** | Not credible on the evidence. No payout, reasoning on record. |
| **HoldForPatch** | Credible, with a fix attached. The reward escrows until the patch is verified. |
| **MergeDuplicate** | Overlaps an earlier claim. The bounty splits by attribution, weighted to the first reporter. |
| **Escalate** | A credible Critical on a flagged target. The campaign pauses for review. |

## Trustless settlement

This is the core of Remedy. `settle_claim` on the vault is **permissionless**: anyone can call it. It reads the verdict directly from the verifier on-chain, binds it to the claim (the verdict's claim_id and target must match), and applies the verifier's own outcome, severity, and payout. No caller supplies any numbers, and no owner, project, or privileged party relays the result.

To prove there is no privileged relay, a wallet with no connection to the campaign settled a bounty on-chain. The vault derived the outcome and amounts from the verifier, not from the caller:

Receipt: https://explorer-studio.genlayer.com/tx/0xabcc909ef7456054fd8fd477975a31564b24013205a5dac60be6ed39fec7ddfe

## Disagreement is signal

Every verdict carries a minority_note: the strongest dissenting view, produced by the same consensus that set the outcome and written on-chain alongside the verdict. It is one dissenting view per verdict, produced in consensus, not a tally of individual validators.

## Architecture

Two Python Intelligent Contracts on GenLayer Studio:

- **Verifier** (`0x94e4535133e71d82C15A811070B34Cd72C505a97`) fetches the locked evidence with `gl.nondet.web.get` inside `gl.eq_principle.strict_eq`, reasons via `gl.eq_principle.prompt_non_comparative`, and returns a structured JSON verdict keyed by case_id. It produces verdicts only and never touches funds.
- **Vault** (`0xF636CB3967DD998FF5f1Bd3ab3900933bF54AdC4`) embeds the GenUSDC settlement token, holds bounty pools, records campaigns and claims, and settles by reading the verifier directly. Privileged actions use the real transaction sender; there is no spoofable caller parameter. `mint` is owner-gated for demos; a public capped `faucet` grants each address a one-time 50000 test allowance.

Frontend: React + TypeScript + Vite + genlayer-js, deployed on Vercel. Wallet support is MetaMask plus a demo burner fallback.

## Tested

Proven live across two vulnerability classes on two fresh targets:

- **VulnBank.sol** (reentrancy)
- **CredencePayout.sol** (unchecked external-call return value)

On CredencePayout the verifier rewarded the real unchecked-call bug, rejected a false reentrancy claim by reasoning about checks-effects-interactions ordering, rejected a false access-control claim by quoting the actual guard in the code, and held a patched claim in escrow at a nuanced Medium severity. It reasons over the specific code; it does not pattern-match.

## Scope and honest limitations

- Remedy verifies security-claim credibility from readable evidence. It does **not** execute exploits: validators reason over the contract source, the proof-of-concept as written, and the patch diff. This is a credibility verdict from static evidence, not a proof of execution.
- V1 covers smart-contract security claims that are statically judgeable from readable code, PoC, and diffs. Exploits needing live execution are out of scope.
- The verifier reasons over readable source in any language, but verdict quality is strongest for well-documented contract languages, Solidity most of all.
- Reviews are run manually in V1. A scheduler is wired but optional.
- GenUSDC is an embedded testnet token with no real value. A production deployment would use a real bridged asset.
- A project can submit a claim on its own campaign. This is economically pointless: the pool is the project's own funds, so a self-payout only returns their deposit minus the protocol fee. It also cannot be cleanly prevented on-chain, since a project could fund from one wallet and submit from another. Credibility is still decided by consensus, so a project cannot force a payout on a claim that is not genuine.

## Run it

    cd frontend
    npm install
    npm run dev

Then open the local URL. Use Demo mode for a throwaway wallet and click the faucet for test funds; no MetaMask or real crypto required. Open a campaign, submit a claim, run the review, and settle it to watch the full loop.

## Links

- Live app: [LIVE APP URL]
- Settlement receipt: https://explorer-studio.genlayer.com/tx/0xabcc909ef7456054fd8fd477975a31564b24013205a5dac60be6ed39fec7ddfe
