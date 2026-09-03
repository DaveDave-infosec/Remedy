import { useState } from "react";
import {
  runReview,
  getVerdict,
  settleClaim,
  dismissClaim,
  submitFix,
  verifyFix,
  releaseEscrow,
  refundEscrow,
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
  claim_id: string;
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
  const [verifying, setVerifying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [submittingFix, setSubmittingFix] = useState(false);
  const [patchedUrl, setPatchedUrl] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  async function doSubmitFix() {
    setErr(null);
    if (patchedUrl.trim() === "") {
      setErr("Paste a commit-pinned raw GitHub URL of the patched contract first.");
      return;
    }
    setSubmittingFix(true);
    try {
      await submitFix(claim.claim_id, patchedUrl.trim());
      setPatchedUrl("");
      onSettled();
    } catch (e: any) {
      setErr("Submit fix failed: " + (e?.message ?? String(e)));
    } finally {
      setSubmittingFix(false);
    }
  }
  const [err, setErr] = useState<string | null>(null);

  async function runReviewFlow() {
    setErr(null);
    setBusy(true);
    try {
      setPhase(1);
      let reviewError: any = null;
      try {
        await runReview(claim.claim_id);
      } catch (e: any) {
        reviewError = e;
      }

      setPhase(2);
      // A review is a heavy consensus write (web fetch + model), so the verdict can
      // land a little after runReview returns or times out. Poll the read for a while
      // before declaring anything wrong; reads already retry transient node blips.
      let v = await resolveVerdictForClaim();
      for (let i = 0; i < 12 && !v; i++) {
        await new Promise((r) => setTimeout(r, 3500));
        v = await resolveVerdictForClaim();
      }
      if (!v) {
        setErr(
          "The review is still settling, or the node is busy. Wait a moment and click Refresh to load the verdict. Do not run the review again." +
            (reviewError ? " (" + (reviewError?.message ?? String(reviewError)) + ")" : "")
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
      setPhase(-1);
    } catch (e: any) {
      setErr("Review failed: " + (e?.message ?? String(e)));
      setPhase(-1);
    } finally {
      setBusy(false);
    }
  }

  // Find the newest verdict that is bound to THIS claim (claim_id match).
  async function resolveVerdictForClaim(): Promise<Verdict | null> {
    const { getAllVerifierCaseIds } = await import("../lib/contracts");
    const ids = await getAllVerifierCaseIds();
    if (!ids || ids.length === 0) return null;
    // ids are newest-first; find the first whose claim_id matches this claim
    for (const id of ids) {
      const v = await getVerdict(id);
      if (v && v.case_id && v.claim_id === claim.claim_id) {
        return v as Verdict;
      }
    }
    return null;
  }

  async function settle() {
    if (!verdict) return;
    setErr(null);
    setSettling(true);
    const held = verdict;
    setVerdict(null);
    try {
      await settleClaim(claim.claim_id);
      onSettled();
    } catch (e: any) {
      setErr("Settlement failed: " + (e?.message ?? String(e)));
      setVerdict(held);
    } finally {
      setSettling(false);
    }
  }

  async function doVerifyFix() {
    setErr(null);
    setVerifying(true);
    try {
      await verifyFix(claim.claim_id);
      onSettled();
    } catch (e: any) {
      setErr("Verify fix failed: " + (e?.message ?? String(e)));
    } finally {
      setVerifying(false);
    }
  }

  async function doReleaseEscrow() {
    setErr(null);
    setReleasing(true);
    try {
      await releaseEscrow(claim.claim_id);
      onSettled();
    } catch (e: any) {
      setErr("Release escrow failed: " + (e?.message ?? String(e)));
    } finally {
      setReleasing(false);
    }
  }

  async function doRefundEscrow() {
    setErr(null);
    setRefunding(true);
    try {
      await refundEscrow(claim.claim_id);
      onSettled();
    } catch (e: any) {
      setErr("Refund escrow failed: " + (e?.message ?? String(e)));
    } finally {
      setRefunding(false);
    }
  }

  async function doDismiss() {
    setErr(null);
    setConfirmDismiss(false);
    setDismissing(true);
    try {
      await dismissClaim(claim.claim_id);
      onSettled();
    } catch (e: any) {
      setErr("Dismiss failed: " + (e?.message ?? String(e)));
      setDismissing(false);
    }
  }

  if (claim.status !== "open" && claim.status !== "held") return null;

  const idle = !verdict && phase < 0 && !settling && !dismissing;
  const heldBusy = submittingFix || verifying || releasing || refunding;

  return (
    <div className="actions">
      {claim.status === "open" && idle && !confirmDismiss && (
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

      {claim.status === "open" && confirmDismiss && idle && (
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

      {claim.status === "open" && dismissing && (
        <div className="settling-panel mono">
          <span className="settling-dot" aria-hidden="true" />
          Dismissing claim on-chain…
        </div>
      )}

      {claim.status === "open" && phase >= 0 && <PhaseLadder active={phase} />}

      {claim.status === "open" && settling && (
        <div className="settling-panel mono">
          <span className="settling-dot" aria-hidden="true" />
          Settling on-chain — the vault is reading the verdict from the verifier…
        </div>
      )}

      {claim.status === "open" && verdict && !settling && (
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
              <div className="v-pay mono">
                split {verdict.payout}: original {verdict.original_bps / 100}% / duplicate{" "}
                {verdict.duplicate_bps / 100}% — the vault resolves the original claim itself
              </div>
            )}
          </div>

          <div className="verdict-actions">
            <button className="primary small" onClick={settle} disabled={settling}>
              Settle: {verdict.outcome}
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
          <div className="trustless-note mono">
            Settlement is permissionless — anyone can trigger it. The vault reads this
            verdict directly from the verifier; no human supplies the outcome or amounts.
          </div>
        </div>
      )}

      {claim.status === "held" && (
        <div className="held-actions">
          {(claim as any).patched_url ? (
            <div className="fix-current mono">
              patched artifact: {(claim as any).patched_url}
            </div>
          ) : (
            <div className="fix-current mono">
              No patched artifact submitted yet. Paste a NEW commit-pinned URL of the
              fixed contract, then Verify fix judges that artifact.
            </div>
          )}
          <div className="fix-submit-row">
            <input
              className="fix-url-input mono"
              type="text"
              value={patchedUrl}
              placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<40-char commit sha>/<path>"
              onChange={(e) => setPatchedUrl(e.target.value)}
              disabled={disabled || heldBusy}
            />
            <button
              className="primary small"
              onClick={doSubmitFix}
              disabled={disabled || heldBusy}
            >
              {submittingFix ? "Submitting…" : "Submit fix"}
            </button>
          </div>
          <div className="action-row">
            <button
              className="primary small"
              onClick={doVerifyFix}
              disabled={disabled || heldBusy}
            >
              {verifying ? "Verifying fix…" : "Verify fix"}
            </button>
            <button
              className="primary small"
              onClick={doReleaseEscrow}
              disabled={disabled || heldBusy}
            >
              {releasing ? "Releasing escrow…" : "Release escrow"}
            </button>
            <button
              className="primary small"
              onClick={doRefundEscrow}
              disabled={disabled || heldBusy}
            >
              {refunding ? "Refunding escrow…" : "Refund escrow"}
            </button>
          </div>
        </div>
      )}

      {err && <div className="error mono">{err}</div>}
    </div>
  );
}
