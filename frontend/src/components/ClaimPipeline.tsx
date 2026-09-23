import { useEffect, useState } from "react";

// V3 pillar 3: the hero visual.
// A single claim travels the real settlement path: SUBMITTED, VERIFIED, SEALED,
// SETTLED. The seal flips from the researcher's claimed CRITICAL to the severity
// consensus actually assigned, then the settlement hash types itself out.
// The loop restarts so a visitor sees a bounty settle within a few seconds.
// Under reduced motion the final, settled state is shown at once and nothing moves.

const STAGES = ["SUBMITTED", "VERIFIED", "SEALED", "SETTLED"];
const TX = "0xee0e886feebf45b6de68f00bc18a6e10ade17d00a9a491bbdd77c64c3c32cb69";
const SETTLED = STAGES.length - 1;

export function ClaimPipeline() {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [stage, setStage] = useState(reduced ? SETTLED : 0);
  const [typed, setTyped] = useState(reduced ? TX.length : 0);

  // advance through the pipeline, then hold on the settled state and restart
  useEffect(() => {
    if (reduced) return;
    const hold = stage === SETTLED ? 3400 : stage === 0 ? 1100 : 1500;
    const t = setTimeout(() => {
      setStage((s) => (s >= SETTLED ? 0 : s + 1));
      if (stage >= SETTLED) setTyped(0);
    }, hold);
    return () => clearTimeout(t);
  }, [stage, reduced]);

  // type the settlement hash once the claim settles
  useEffect(() => {
    if (reduced || stage < SETTLED || typed >= TX.length) return;
    const t = setTimeout(() => setTyped((n) => Math.min(TX.length, n + 3)), 16);
    return () => clearTimeout(t);
  }, [stage, typed, reduced]);

  const sealed = stage >= 2;
  const settled = stage >= SETTLED;
  const grade = sealed ? "MEDIUM" : "CRITICAL";
  const tone = sealed ? "med" : "crit";

  return (
    <div className="cp" aria-label="A claim settling through consensus">
      <div className={"cp-card" + (settled ? " cp-card-settled" : "")}>
        <div className="cp-card-head">
          <span className="cp-id">clm_0</span>
          <span className="cp-target">target #0</span>
          <span className={"cp-state cp-state-" + stage}>{STAGES[stage]}</span>
        </div>

        <p className="cp-poc">
          Unchecked low-level call in claim(): the payout is sent without checking the
          returned success flag.
        </p>

        <div className="cp-body">
          <svg
            className={"cp-seal cp-seal-" + tone + (sealed ? " cp-seal-on" : "")}
            viewBox="0 0 120 120"
            role="img"
            aria-label={"Severity seal, " + grade.toLowerCase()}
          >
            <polygon
              className="cp-seal-ring"
              points="104.3,78.4 78.4,104.3 41.6,104.3 15.7,78.4 15.7,41.6 41.6,15.7 78.4,15.7 104.3,41.6"
            />
            <text className="cp-seal-grade" x="60" y="58" textAnchor="middle">
              {grade}
            </text>
            <text className="cp-seal-state" x="60" y="74" textAnchor="middle">
              {sealed ? "SEALED" : "CLAIMED"}
            </text>
          </svg>

          {/* every line is always rendered so the card never changes size;
              a line is only made visible once the claim reaches its stage */}
          <div className="cp-verdict">
            <div className={"cp-line" + (stage >= 1 ? " cp-line-on" : "")}>
              <span className="cp-k">consensus</span>
              <span className="cp-v">credible, severity set to Medium</span>
            </div>
            <div className={"cp-line" + (stage >= 2 ? " cp-line-on" : "")}>
              <span className="cp-k">minority</span>
              <span className="cp-v">one view argued High; recorded on-chain</span>
            </div>
            <div className={"cp-line" + (settled ? " cp-line-on" : "")}>
              <span className="cp-k">paid</span>
              <span className="cp-v cp-paid">1950 genUSDC</span>
            </div>
          </div>
        </div>

        {/* the hash area reserves room for the full two-line hash from the
            start, so typing it out cannot grow the card */}
        <div className="cp-hash" aria-live="off">
          <span className="cp-k">{settled ? "tx" : ""}</span>
          <span className="cp-hash-slot">
            {settled ? (
              <>
                <span className="cp-hash-text">{TX.slice(0, typed)}</span>
                {typed < TX.length && <span className="cp-caret" />}
              </>
            ) : (
              <span className="cp-hash-wait">settlement is permissionless</span>
            )}
          </span>
        </div>
      </div>

      <div className="cp-rail" aria-hidden="true">
        {STAGES.map((label, i) => (
          <div key={label} className="cp-rail-seg">
            <span className={"cp-rail-dot" + (i <= stage ? " cp-on" : "")} />
            <span className={"cp-rail-label" + (i <= stage ? " cp-on" : "")}>{label}</span>
            {i < STAGES.length - 1 && (
              <span className={"cp-rail-conn" + (i < stage ? " cp-on" : "")} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
