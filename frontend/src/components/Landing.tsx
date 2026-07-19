import { useState, useEffect } from "react";
import "./Landing.css";

const SEAL_CYCLE = [
  { grade: "CRITICAL", tone: "crit" },
  { grade: "HIGH", tone: "high" },
  { grade: "MEDIUM", tone: "med" },
  { grade: "LOW", tone: "low" },
  { grade: "CRITICAL", tone: "crit" },
];

type LandingProps = {
  onEnter: () => void;
};

export function Landing({ onEnter }: LandingProps) {
  const [sealStep, setSealStep] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSealStep(SEAL_CYCLE.length - 1);
      return;
    }
    if (sealStep >= SEAL_CYCLE.length - 1) return;
    const t = setTimeout(() => setSealStep((s) => s + 1), sealStep === 0 ? 1200 : 480);
    return () => clearTimeout(t);
  }, [sealStep]);

  const seal = SEAL_CYCLE[sealStep];

  return (
    <div className="lp">
      <header className="lp-bar">
        <div className="lp-brand-group">
          <span className="lp-brand">REMEDY</span>
          <span className="lp-register">security resolution protocol</span>
        </div>
        <button className="lp-bar-cta" onClick={onEnter}>
          Open the protocol &rarr;
        </button>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">CONSENSUS SECURITY SETTLEMENT</div>
          <h1 className="lp-headline">
            Who decides a bug is worth <span className="lp-figure">$50,000</span>?
          </h1>
          <p className="lp-subhead">
            A researcher files a smart-contract vulnerability. GenLayer validators read
            the evidence, reach consensus, and settle the bounty themselves. No
            committee. No relay. Consensus.
          </p>
          <div className="lp-cta-row">
            <button className="lp-cta" onClick={onEnter}>
              Open the protocol &rarr;
            </button>
            <span className="lp-cta-note">live on GenLayer Studio Network</span>
          </div>
        </div>

        <div className="lp-hero-seal">
          <svg
            className={"lp-seal lp-seal-tone-" + seal.tone}
            viewBox="0 0 200 200"
            role="img"
            aria-label={"Severity seal, " + seal.grade.toLowerCase() + ", sealed"}
          >
            <g className="lp-seal-strike">
              <polygon
                className="lp-seal-ring"
                points="173.9,130.6 130.6,173.9 69.4,173.9 26.1,130.6 26.1,69.4 69.4,26.1 130.6,26.1 173.9,69.4"
              />
              <polygon
                className="lp-seal-ring-inner"
                points="161.0,125.2 125.2,161.0 74.8,161.0 39.0,125.2 39.0,74.8 74.8,39.0 125.2,39.0 161.0,74.8"
              />
              <text className="lp-seal-kicker" x="100" y="82" textAnchor="middle">
                SEVERITY
              </text>
              <text className="lp-seal-grade" x="100" y="110" textAnchor="middle">
                {seal.grade}
              </text>
              <text className="lp-seal-state" x="100" y="130" textAnchor="middle">
                SEALED
              </text>
            </g>
          </svg>
        </div>
      </section>

      <div className="lp-timeline" aria-label="Disclosure timeline">
        <div className="lp-tl-node lp-tl-1">
          <span className="lp-tl-dot" />
          <span className="lp-tl-label">SUBMITTED</span>
        </div>
        <span className="lp-tl-conn lp-tl-conn-1" />
        <div className="lp-tl-node lp-tl-2">
          <span className="lp-tl-dot" />
          <span className="lp-tl-label">VERIFIED</span>
        </div>
        <span className="lp-tl-conn lp-tl-conn-2" />
        <div className="lp-tl-node lp-tl-3">
          <span className="lp-tl-dot" />
          <span className="lp-tl-label">SEALED</span>
        </div>
        <span className="lp-tl-conn lp-tl-conn-3" />
        <div className="lp-tl-node lp-tl-4">
          <span className="lp-tl-dot" />
          <span className="lp-tl-label">SETTLED</span>
        </div>
      </div>

      <div className="lp-stats">
        <div className="lp-stat">
          <span className="lp-stat-num">5</span>
          <span className="lp-stat-label">settlement outcomes</span>
        </div>
        <div className="lp-stat lp-stat-sage">
          <span className="lp-stat-num">0</span>
          <span className="lp-stat-label">trusted humans in the loop</span>
        </div>
        <div className="lp-stat">
          <span className="lp-stat-num">100%</span>
          <span className="lp-stat-label">verdicts on-chain</span>
        </div>
      </div>

      <section className="lp-dissent">
        <div className="lp-dissent-copy">
          <div className="lp-eyebrow">MINORITY ON THE RECORD</div>
          <h2 className="lp-dissent-head">
            Every verdict carries its own strongest counterargument.
          </h2>
          <p className="lp-dissent-body">
            The same consensus that sets the outcome must also state the best case
            against itself. That dissent is written on-chain alongside the verdict, not
            buried. In GenLayer, disagreement is signal.
          </p>
          <p className="lp-dissent-foot">
            One dissenting view per verdict, produced in consensus. Not a tally of
            individual validators.
          </p>
        </div>

        <div className="lp-verdict-card">
          <div className="lp-vc-head">
            <span className="lp-vc-outcome">REWARD</span>
            <span className="lp-vc-sev">HIGH</span>
            <span className="lp-vc-case">remedy_7</span>
          </div>
          <p className="lp-vc-reason">
            The withdraw path ignores the return value of the low-level call, so a
            failed transfer still marks the payout complete. Funds can be lost while
            state reads settled.
          </p>
          <div className="lp-vc-minority">
            <span className="lp-vc-minlabel">minority</span>
            If the target reverts upstream on any failed transfer, the ignored return
            value is unreachable in practice and severity may be Medium.
          </div>
        </div>
      </section>

      <section className="lp-problem">
        <div className="lp-eyebrow">THE PROBLEM</div>
        <h2 className="lp-problem-head">
          A bounty runs on trust. That is the vulnerability.
        </h2>
        <p className="lp-problem-lead">
          When a researcher discloses a flaw, a human decides whether it is real, how
          severe it is, whether it duplicates an earlier report, and what it pays. Every
          one of those calls is a trusted intermediary: a point of bias, delay, and
          dispute. The researcher hopes the project pays fairly. The project hopes the
          claim is honest. Nobody can prove the decision was neutral.
        </p>

        <div className="lp-trust">
          <div className="lp-trust-row">
            <span className="lp-trust-q">IS IT REAL?</span>
            <span className="lp-trust-a">
              A reviewer's judgment, unverifiable after the fact.
            </span>
          </div>
          <div className="lp-trust-row">
            <span className="lp-trust-q">HOW SEVERE?</span>
            <span className="lp-trust-a">
              Set by whoever holds the bounty, and the incentive to minimize it.
            </span>
          </div>
          <div className="lp-trust-row">
            <span className="lp-trust-q">A DUPLICATE?</span>
            <span className="lp-trust-a">Contested by memory and goodwill.</span>
          </div>
          <div className="lp-trust-row">
            <span className="lp-trust-q">WHAT PAYS?</span>
            <span className="lp-trust-a">
              Released by hand, if and when the project chooses.
            </span>
          </div>
        </div>

        <p className="lp-problem-turn">
          Remedy removes the human from every one of these calls. Validators read the
          evidence, reach consensus, and the vault settles itself.
        </p>
      </section>

      <section className="lp-outcomes">
        <div className="lp-eyebrow">SETTLEMENT OUTCOMES</div>
        <h2 className="lp-outcomes-head">
          Five ways a claim can settle. The consensus picks one.
        </h2>
        <p className="lp-outcomes-lead">
          Every claim resolves to exactly one outcome. The verifier chooses it from the
          evidence; the vault applies it with no human in between.
        </p>

        <div className="lp-outcomes-register">
          <div className="lp-out-row lp-out-reward">
            <span className="lp-out-idx">01</span>
            <div className="lp-out-main">
              <span className="lp-out-name">REWARD</span>
              <span className="lp-out-def">
                Credible and novel. The vault pays the bounty to the researcher.
              </span>
            </div>
          </div>
          <div className="lp-out-row lp-out-reject">
            <span className="lp-out-idx">02</span>
            <div className="lp-out-main">
              <span className="lp-out-name">REJECT</span>
              <span className="lp-out-def">
                Not credible on the evidence. No payout, with the reasoning on record.
              </span>
            </div>
          </div>
          <div className="lp-out-row lp-out-hold">
            <span className="lp-out-idx">03</span>
            <div className="lp-out-main">
              <span className="lp-out-name">HOLD FOR PATCH</span>
              <span className="lp-out-def">
                Credible, with a fix attached. The reward escrows until the patch is
                verified.
              </span>
            </div>
          </div>
          <div className="lp-out-row lp-out-merge">
            <span className="lp-out-idx">04</span>
            <div className="lp-out-main">
              <span className="lp-out-name">MERGE DUPLICATE</span>
              <span className="lp-out-def">
                Overlaps an earlier claim. The bounty splits by attribution, weighted to
                the first reporter.
              </span>
            </div>
          </div>
          <div className="lp-out-row lp-out-escalate">
            <span className="lp-out-idx">05</span>
            <div className="lp-out-main">
              <span className="lp-out-name">ESCALATE</span>
              <span className="lp-out-def">
                A credible Critical on a flagged target. The campaign pauses for review.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-proof">
        <div className="lp-eyebrow">THE PROOF</div>
        <h2 className="lp-proof-head">
          A stranger settled a bounty. Here is the receipt.
        </h2>
        <p className="lp-proof-body">
          settle_claim is permissionless: anyone can trigger it. To show there is no
          privileged relay, a wallet with no connection to the campaign called it and
          drove a real payout. The verdict was read straight from the verifier on-chain;
          the caller supplied nothing but the claim.
        </p>

        <div className="lp-exhibit">
          <div className="lp-exhibit-head">
            <span className="lp-exhibit-tag">ON-CHAIN RECEIPT</span>
            <span className="lp-exhibit-net">GenLayer Studio Network</span>
          </div>
          <div className="lp-exhibit-grid">
            <div className="lp-ex-row">
              <span className="lp-ex-k">CALLER</span>
              <span className="lp-ex-v">A bystander wallet, unrelated to the campaign.</span>
            </div>
            <div className="lp-ex-row">
              <span className="lp-ex-k">ACTION</span>
              <span className="lp-ex-v">settle_claim</span>
            </div>
            <div className="lp-ex-row">
              <span className="lp-ex-k">RESULT</span>
              <span className="lp-ex-v">
                Bounty paid, outcome applied from the verifier's own verdict.
              </span>
            </div>
            <div className="lp-ex-row">
              <span className="lp-ex-k">TX</span>
              <span className="lp-ex-v lp-ex-hash">
                0xabcc909ef7456054fd8fd477975a31564b24013205a5dac60be6ed39fec7ddfe
              </span>
            </div>
          </div>
          
          <a
            className="lp-exhibit-link"
            href="https://explorer-studio.genlayer.com/tx/0xabcc909ef7456054fd8fd477975a31564b24013205a5dac60be6ed39fec7ddfe"
            target="_blank"
            rel="noopener noreferrer"
          >
            View the transaction on the explorer &rarr;
          </a>
        </div>
      </section>

      <section className="lp-vulns">
        <div className="lp-eyebrow">TESTED ACROSS VULN CLASSES</div>
        <h2 className="lp-vulns-head">It reasons. It does not pattern-match.</h2>
        <p className="lp-vulns-lead">
          On two fresh targets it never saw before, VulnBank and CredencePayout, the
          verifier told real bugs from false claims across distinct vulnerability
          classes, and held a fixed one in escrow. Same primitive, no hard-coded rules.
        </p>

        <div className="lp-vuln-grid">
          <div className="lp-vuln-card">
            <div className="lp-vuln-top">
              <span className="lp-vuln-class">UNCHECKED EXTERNAL CALL</span>
              <span className="lp-vuln-verdict lp-vv-reward">REWARD</span>
            </div>
            <p className="lp-vuln-note">
              Caught the real bug on CredencePayout: a failed transfer still marked the
              payout complete.
            </p>
          </div>
          <div className="lp-vuln-card">
            <div className="lp-vuln-top">
              <span className="lp-vuln-class">REENTRANCY</span>
              <span className="lp-vuln-verdict lp-vv-reject">REJECT</span>
            </div>
            <p className="lp-vuln-note">
              Rejected a false reentrancy claim by reasoning about
              checks-effects-interactions ordering.
            </p>
          </div>
          <div className="lp-vuln-card">
            <div className="lp-vuln-top">
              <span className="lp-vuln-class">ACCESS CONTROL</span>
              <span className="lp-vuln-verdict lp-vv-reject">REJECT</span>
            </div>
            <p className="lp-vuln-note">
              Rejected a false access-control claim, quoting the actual guard in the code.
            </p>
          </div>
          <div className="lp-vuln-card">
            <div className="lp-vuln-top">
              <span className="lp-vuln-class">PATCHED SUBMISSION</span>
              <span className="lp-vuln-verdict lp-vv-hold">HOLD FOR PATCH</span>
            </div>
            <p className="lp-vuln-note">
              Held a fixed claim in escrow at a nuanced Medium severity.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-close">
        <div className="lp-close-inner">
          <div className="lp-eyebrow">RUN A CLAIM YOURSELF</div>
          <h2 className="lp-close-head">
            Watch a vulnerability go from evidence to payout.
          </h2>
          <p className="lp-close-body">
            Open a campaign, file a claim, run the review, and settle it. Demo mode gives
            you a throwaway wallet and a faucet, so you can drive the whole loop without
            spending anything real.
          </p>
          <div className="lp-cta-row">
            <button className="lp-cta" onClick={onEnter}>
              Open the protocol &rarr;
            </button>
            <span className="lp-cta-note">demo mode, no wallet needed</span>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-foot-left">
          <span className="lp-foot-brand">REMEDY</span>
          <span className="lp-foot-meta">GenLayer Studio Network / chainId 61999</span>
        </div>
        
          <a
          className="lp-foot-link"
          href="https://github.com/DaveDave-infosec/Remedy"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub &rarr;
        </a>
      </footer>
    </div>
  );
}
