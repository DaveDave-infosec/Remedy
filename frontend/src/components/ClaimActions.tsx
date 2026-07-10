import { useState } from "react";
import {
  getPriorsJson,
  runReview,
  getVerdict,
  applyOutcome,
  applyMergeDuplicate,
  dismissClaim,
} from "../lib/contracts";
import { PhaseLadder } from "./PhaseLadder";

type Claim = {
  claim_id: string;
  seq: number;
  submitter: string;
  status: string;
  claimed_severity: string;
  target_url: string;
  poc_text: string;
  patch_diff: string;
};

type Verdict = {
  case_id: string;
  outcome: string;
  severity: string;
  payout: number;
  reasoning: string;
  minority_note: string;
  patch_assessment: string;
  is_duplicate: boolean;
  duplicate_of_seq: number;
  original_bps: number;
  duplicate_bps: number;
};

export function ClaimActions({
  account,
  claim,
  campaign,
  siblingClaims,
  disabled,
  onSettled,
}: {
  account: string;
  claim: Claim;
  campaign: {
    campaign_id: string;
    target_url: string;
    pay_critical: number;
    pay_high: number;
    pay_medium: number;
    pay_low: number;
    is_critical_target: boolean;
  };
  siblingClaims: Claim[];
  disabled: boolean;
  onSettled: () => void;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<number>(-1);
  const [settling, setSettling] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [originalClaimId, setOriginalClaimId] = useState<string>("");

  async function runReviewFlow() {
    setErr(null);
    setBusy(true);
    try {
      setPhase(0);
      const priorsJson = await getPriorsJson(campaign.campaign_id, claim.claim_id);

      setPhase(1);
      await runReview(
        claim.target_url,
        claim.poc_text,
        claim.patch_diff,
        claim.claimed_severity,
        campaign.pay_critical,
        campaign.pay_high,
        campaign.pay_medium,
        campaign.pay_low,
        campaign.is_critical_target,
        priorsJson
      );

      setPhase(2);
      const v = await resolveLatestVerdict();
      if (!v) {
        setErr(
          "The review transaction completed, but the verdict could not be read back from the verifier. This can happen if the validators are busy. Wait a moment and try Run review again."
        );
        setPhase(-1);
        setBusy(false);
        return;
      }

      setPhase(3);
      await new Promise((r) => setTimeout(r, 450));
      setPhase(4);
      await new Promise((r) => setTimeout(r, 450));

      setVerdict(v);
      if (v.outcome === "MergeDuplicate") {
        const match = siblingClaims.find(
          (c) => c.seq === v.duplicate_of_seq && c.claim_id !== claim.claim_id
        );
        setOriginalClaimId(match ? match.claim_id : "");
      }
      setPhase(-1);
    } catch (e: any) {
      setErr("Review failed: " + (e?.message ?? String(e)));
      setPhase(-1);
    } finally {
      setBusy(false);
    }
  }

  async function resolveLatestVerdict(): Promise<Verdict | null> {
    const { getAllVerifierCaseIds } = await import("../lib/contracts");
    const ids = await getAllVerifierCaseIds();
    if (!ids || ids.length === 0) return null;
    const latest = ids[0];
    const v = await getVerdict(latest);
    if (!v || !v.case_id) return null;
    return v as Verdict;
  }

  async function settle() {
    if (!verdict) return;
    setErr(null);
    setSettling(true);
    const held = verdict;
    setVerdict(null);
    try {
      if (held.outcome === "MergeDuplicate") {
        if (!originalClaimId) {
          setErr("Select the original claim to split attribution with.");
          setVerdict(held);
          setSettling(false);
          return;
        }
        await applyMergeDuplicate(
          account,
          claim.claim_id,
          originalClaimId,
          held.severity,
          held.payout,
          held.original_bps,
          held.duplicate_bps,
          held.case_id,
          held.reasoning,
          held.minority_note
        );
      } else {
        await applyOutcome(
          account,
          claim.claim_id,
          held.outcome,
          held.severity,
          held.payout,
          held.case_id,
          held.reasoning,
          held.minority_note
        );
      }
      onSettled();
    } catch (e: any) {
      setErr("Settlement failed: " + (e?.message ?? String(e)));
      setVerdict(held);
    } finally {
      setSettling(false);
    }
  }

  async function doDismiss() {
    setErr(null);
    setConfirmDismiss(false);
    setDismissing(true);
    try {
      await dismissClaim(account, claim.claim_id);
      // keep the dismissing panel up through the reload; the claim will
      // leave the open list once the chain confirms, replacing this row.
      onSettled();
    } catch (e: any) {
      setErr("Dismiss failed: " + (e?.message ?? String(e)));
      setDismissing(false);
    }
  }

  if (claim.status !== "open") return null;

  const idle = !verdict && phase < 0 && !settling && !dismissing;

  return (
    <div className="actions">
      {idle && !confirmDismiss && (
        <div className="action-row">
          <button className="primary small" onClick={runReviewFlow} disabled={disabled || busy}>
            {busy ? "Reviewing…" : "Run review"}
          </button>
          <button
            className="link danger-link"
            onClick={() => setConfirmDismiss(true)}
            disabled={disabled || busy}
          >
            dismiss
          </button>
        </div>
      )}

      {confirmDismiss && idle && (
        <div className="confirm-row">
          <span className="confirm-text mono">Dismiss this claim? No payout, closes it.</span>
          <button className="link" onClick={doDismiss} disabled={dismissing}>
            {dismissing ? "dismissing…" : "yes, dismiss"}
          </button>
          <button className="link" onClick={() => setConfirmDismiss(false)} disabled={dismissing}>
            cancel
          </button>
        </div>
      )}

      {dismissing && (
        <div className="settling-panel mono">
          <span className="settling-dot" aria-hidden="true" />
          Dismissing claim on-chain…
        </div>
      )}

      {phase >= 0 && <PhaseLadder active={phase} />}

      {settling && (
        <div className="settling-panel mono">
          <span className="settling-dot" aria-hidden="true" />
          Settling on-chain — confirming settlement…
        </div>
      )}

      {verdict && !settling && (
        <div className="verdict">
          <div className="verdict-head">
            <span className={"outcome outcome-" + verdict.outcome.toLowerCase()}>
              {verdict.outcome}
            </span>
            {verdict.severity && verdict.severity !== "None" && (
              <span className={"sev sev-" + verdict.severity.toLowerCase()}>
                {verdict.severity}
              </span>
            )}
            <span className="case-id mono">{verdict.case_id}</span>
          </div>

          <div className="verdict-body">
            <div className="v-reason">{verdict.reasoning}</div>
            {verdict.patch_assessment && verdict.patch_assessment !== "none submitted" && (
              <div className="v-patch mono">patch: {verdict.patch_assessment}</div>
            )}
            {verdict.minority_note && (
              <div className="v-minority">
                <span className="v-label">minority</span> {verdict.minority_note}
              </div>
            )}

            {verdict.outcome === "Reward" && (
              <div className="v-pay mono">pays {verdict.payout} (minus fee)</div>
            )}
            {verdict.outcome === "HoldForPatch" && (
              <div className="v-pay mono">escrows {verdict.payout} pending fix</div>
            )}
            {verdict.outcome === "MergeDuplicate" && (
              <div className="v-merge">
                <div className="v-pay mono">
                  split {verdict.payout}: original {verdict.original_bps / 100}% / duplicate{" "}
                  {verdict.duplicate_bps / 100}%
                </div>
                <label className="merge-label">Original claim to split with:</label>
                <select
                  value={originalClaimId}
                  onChange={(e) => setOriginalClaimId(e.target.value)}
                >
                  <option value="">— select —</option>
                  {siblingClaims
                    .filter((c) => c.claim_id !== claim.claim_id)
                    .map((c) => (
                      <option key={c.claim_id} value={c.claim_id}>
                        {c.claim_id} (seq {c.seq})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div className="verdict-actions">
            <button className="primary small" onClick={settle} disabled={settling}>
              {verdict.outcome === "MergeDuplicate"
                ? "Settle: merge split"
                : "Settle: " + verdict.outcome}
            </button>
            <button
              className="link"
              onClick={() => {
                setVerdict(null);
                setErr(null);
              }}
              disabled={settling}
            >
              discard verdict
            </button>
          </div>
        </div>
      )}

      {err && <div className="error mono">{err}</div>}
    </div>
  );
}
