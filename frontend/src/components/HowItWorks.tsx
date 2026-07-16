export function HowItWorks() {
  return (
    <div className="doc">
      <h2>How Remedy works</h2>
      <p className="doc-lead">
        Remedy is a consensus settlement layer for smart-contract security claims. A
        researcher submits a claim against a protected target; GenLayer validators
        judge its credibility from readable evidence, set severity, resolve
        duplicates, and drive the disclosure to a settlement outcome. No Immunefi, no
        HackerOne, no internal committee decides. Consensus does.
      </p>

      <h3>The lifecycle</h3>
      <p>
        A project opens a security campaign — a living bounty pool locked against one
        or more target contracts, with a severity-to-payout schedule. Researchers
        submit claims over time. Each claim locks its evidence at intake: the target
        source, the proof-of-concept as written, and any proposed patch. Nothing about
        a claim can be edited or backdated after submission.
      </p>
      <p>
        When a review runs, validators independently fetch the locked evidence and
        reason over it, then reach consensus on one of five outcomes.
      </p>

      <h3>The five outcomes</h3>
      <ul className="doc-list">
        <li>
          <span className="doc-tag outcome-reward">Reward</span> The claim is credible
          and the flaw is real. The bounty is released to the researcher, less a
          protocol fee, and the claim closes.
        </li>
        <li>
          <span className="doc-tag outcome-reject">Reject</span> The code does not
          exhibit the claimed flaw, the proof-of-concept does not match the code, or
          the submission is a gaming attempt. No payout.
        </li>
        <li>
          <span className="doc-tag outcome-holdforpatch">Hold-for-Patch</span> The
          claim is credible and a patch was submitted. The payout is escrowed until a
          deployed fix is verified in a re-review.
        </li>
        <li>
          <span className="doc-tag outcome-mergeduplicate">Merge-Duplicate</span> The
          claim overlaps a prior one on the same target. Validators determine an
          attribution split — weighted toward the first reporter, adjusted for report
          quality — and the bounty splits proportionally.
        </li>
        <li>
          <span className="doc-tag outcome-escalate">Escalate</span> A credible
          critical claim on a predefined critical target. The campaign pauses further
          payouts and flags emergency governance.
        </li>
      </ul>

      <h3>Duplicate attribution</h3>
      <p>
        Every submission is timestamped and ordered on-chain at intake. When a new
        claim arrives, validators compare it against prior open claims on the same
        target: same root cause, overlapping code path, same severity class. Because
        the submission order is fixed on-chain and cannot be forged or backdated, a
        later reporter cannot claim precedence they do not have.
      </p>

      <h3 className="doc-scope">Scope &amp; honest limitations</h3>
      <div className="doc-callout">
        <p>
          <strong>Remedy verifies security-claim credibility from evidence; it does
          not execute exploits.</strong> Validators fetch and reason over readable
          artifacts — contract source, the proof-of-concept as written, the patch diff.
          They do not spin up a sandbox and detonate a proof-of-concept. This is a
          credibility verdict from static evidence, not a proof of execution.
        </p>
      </div>
      <ul className="doc-list">
        <li>
          <strong>Scope.</strong> V1 covers smart-contract security claims only, where
          evidence is statically judgeable from readable code, PoC, and diffs. General
          software exploits that would need live execution are out of scope.
        </li>
        <li>
          <strong>Language coverage.</strong> The verifier reasons over readable source
          in any language, but verdict quality is strongest for well-documented
          contract languages — Solidity most of all, where the common vulnerability
          classes are best understood. Claims on less common languages are judged with
          correspondingly less confidence.
        </li>
        <li>
          <strong>Trustless settlement.</strong> Settlement is permissionless: anyone
          can trigger it. The vault reads the verdict directly from the verifier
          contract by case id, verifies the verdict is bound to that specific claim,
          and applies the verifier&rsquo;s own outcome and amounts. No owner, project,
          or other privileged party relays the result, and no caller supplies the
          numbers &mdash; the payout is derived entirely from consensus.
        </li>
        <li>
          <strong>Scheduler.</strong> Reviews are run manually in V1. A scheduler is
          wired but optional.
        </li>
        <li>
          <strong>Testnet token.</strong> Bounty pools use GenUSDC, an embedded
          testnet faucet token with no real value. Unlimited minting is owner-gated;
          anyone can claim a one-time capped grant from the public faucet. A
          production deployment would use a real bridged asset instead.
        </li>
      </ul>

      <h3 className="doc-scope">Verify it yourself</h3>
      <div className="doc-callout doc-callout-review">
        <p>
          Settlement is provably permissionless. In this on-chain record, a wallet
          with no relationship to the campaign, the claim, or any owner successfully
          settled a bounty &mdash; the vault derived the outcome and amounts from the
          verifier, not from the caller:
        </p>
        <p className="mono receipt-link">
          <a
            href="https://explorer-studio.genlayer.com/tx/0xabcc909ef7456054fd8fd477975a31564b24013205a5dac60be6ed39fec7ddfe"
            target="_blank"
            rel="noopener noreferrer"
          >
            explorer-studio.genlayer.com/tx/0xabcc909e…fec7ddfe
          </a>
        </p>
      </div>

      <p className="doc-foot mono">
        One resolution engine, expandable later: the settlement and lifecycle logic
        stays identical; only the claim type and its verifier set evolve.
      </p>
    </div>
  );
}
