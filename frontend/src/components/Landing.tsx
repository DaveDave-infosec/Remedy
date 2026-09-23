import { useState } from "react";
import "./Landing.css";
import { ClaimPipeline } from "./ClaimPipeline";
import { ConsensusNodes } from "./ConsensusNodes";
import { StatNum } from "./StatNum";
import { useReveal } from "../lib/reveal";

const OUTCOMES = [
  {
    key: "reward",
    name: "REWARD",
    def: "Credible and novel. The vault pays the bounty to the researcher.",
    detail:
      "The vault recomputes the payout from its own severity schedule, pays the researcher minus the protocol fee, and returns the claim bond.",
  },
  {
    key: "reject",
    name: "REJECT",
    def: "Not credible on the evidence. No payout, with the reasoning on record.",
    detail:
      "Nothing leaves the pool. The claim bond is forfeited into the bounty pool, so filing against code that is already sound has a cost.",
  },
  {
    key: "hold",
    name: "HOLD FOR PATCH",
    def: "Credible, with a fix attached. The reward escrows until the patch is verified.",
    detail:
      "The payout moves into escrow and the bond returns at once. Escrow releases only when a new commit-pinned artifact is judged fixed.",
  },
  {
    key: "merge",
    name: "MERGE DUPLICATE",
    def: "Overlaps an earlier claim. The bounty splits by attribution, weighted to the first reporter.",
    detail:
      "Duplicate detection is scoped per target, so two claims on different contracts of one campaign are never merged. Both bonds return.",
  },
  {
    key: "escalate",
    name: "ESCALATE",
    def: "A credible Critical on a flagged target. The campaign pauses for review.",
    detail:
      "No further claims settle until the project resumes the campaign. The bond returns, since the claim was found credible.",
  },
];

const STEPS = [
  {
    n: "01",
    t: "Open a campaign",
    d: "A project locks a bounty pool against up to ten commit-pinned contracts and sets what each severity pays.",
  },
  {
    n: "02",
    t: "File a claim",
    d: "A researcher names the target, writes the proof-of-concept, and locks a bond. Evidence is fixed at intake.",
  },
  {
    n: "03",
    t: "Consensus settles it",
    d: "Validators read the pinned source, agree on an outcome and severity, and the vault pays from its own schedule.",
  },
];

type LandingProps = {
  onEnter: () => void;
};

export function Landing({ onEnter }: LandingProps) {
  const [openOut, setOpenOut] = useState<string | null>(null);
  useReveal([openOut]);

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
        <span className="ember-glow" aria-hidden="true" />
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
          <ClaimPipeline />
        </div>
      </section>

      <div className="lp-stats reveal">
        <div className="lp-stat">
          <StatNum value={5} />
          <span className="lp-stat-label">settlement outcomes</span>
        </div>
        <div className="lp-stat lp-stat-sage">
          <StatNum value={0} />
          <span className="lp-stat-label">trusted humans in the loop</span>
        </div>
        <div className="lp-stat">
          <StatNum value={100} suffix="%" />
          <span className="lp-stat-label">verdicts on-chain</span>
        </div>
      </div>

      <section className="lp-how reveal">
        <div className="lp-eyebrow">HOW IT WORKS</div>
        <h2 className="lp-how-head">Three moves, and no one to ask.</h2>
        <div className="lp-how-grid">
          {STEPS.map((st) => (
            <div key={st.n} className="lp-how-step">
              <span className="lp-how-n">{st.n}</span>
              <h3 className="lp-how-t">{st.t}</h3>
              <p className="lp-how-d">{st.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-dissent reveal">
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

      <section className="lp-problem reveal">
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

      <section className="lp-outcomes reveal">
        <div className="lp-eyebrow">SETTLEMENT OUTCOMES</div>
        <h2 className="lp-outcomes-head">
          Five ways a claim can settle. The consensus picks one.
        </h2>
        <p className="lp-outcomes-lead">
          Every claim resolves to exactly one outcome. The verifier chooses it from the
          evidence; the vault applies it with no human in between.
        </p>

        <div className="lp-out-cards">
          {OUTCOMES.map((o, i) => {
            const open = openOut === o.key;
            return (
              <button
                key={o.key}
                type="button"
                className={"lp-out-card lp-out-" + o.key + (open ? " is-open" : "")}
                onClick={() => setOpenOut(open ? null : o.key)}
                aria-expanded={open}
              >
                <span className="lp-out-idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="lp-out-name">{o.name}</span>
                <span className="lp-out-def">{o.def}</span>
                <span className="lp-out-detail">{o.detail}</span>
                <span className="lp-out-more">{open ? "less" : "what the vault does"}</span>
              </button>
            );
          })}
        </div>

        <div className="lp-consensus">
          <ConsensusNodes />
          <p className="lp-consensus-note">
            Five validators read the same pinned source and converge on one verdict,
            with the strongest dissent recorded beside it.
          </p>
        </div>
      </section>

      <section className="lp-proof reveal">
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
                0xee0e886feebf45b6de68f00bc18a6e10ade17d00a9a491bbdd77c64c3c32cb69
              </span>
            </div>
          </div>
          
          <a
            className="lp-exhibit-link"
            href="https://explorer-studio.genlayer.com/tx/0xee0e886feebf45b6de68f00bc18a6e10ade17d00a9a491bbdd77c64c3c32cb69"
            target="_blank"
            rel="noopener noreferrer"
          >
            View the transaction on the explorer &rarr;
          </a>
        </div>
      </section>

      <section className="lp-vulns reveal">
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

      <section className="lp-close reveal">
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

        <div className="lp-foot-links">
          <a
            className="lp-foot-link"
            href="https://github.com/DaveDave-infosec/Remedy"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub &rarr;
          </a>
          <a
            className="lp-foot-link"
            href="https://github.com/DaveDave-infosec/Remedy/blob/main/TESTING.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Test map &rarr;
          </a>
          <a
            className="lp-foot-link"
            href="https://explorer-studio.genlayer.com/address/0x60c5C00b46a0845A11E5a1D5Cf22a1607E55e994"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vault &rarr;
          </a>
          <a
            className="lp-foot-link"
            href="https://explorer-studio.genlayer.com/address/0x4712c4165eFaf8CCd8F0371E7821ed729c872569"
            target="_blank"
            rel="noopener noreferrer"
          >
            Verifier &rarr;
          </a>
        </div>
      </footer>
    </div>
  );
}
