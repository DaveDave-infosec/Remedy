import { useEffect, useState, useCallback } from "react";
import { getCampaign, getClaimsForCampaign, getClaim, resumeCampaign, getReputation } from "../lib/contracts";
import { SubmitClaim } from "./SubmitClaim";
import { ClaimActions } from "./ClaimActions";
import { SeveritySeal } from "./SeveritySeal";
import { DisclosureTimeline } from "./DisclosureTimeline";

type Campaign = {
  campaign_id: string;
  project: string;
  targets: string[];
  target_count: number;
  bond: number;
  pool: number;
  escrowed: number;
  paid_total: number;
  status: string;
  is_critical_target: boolean;
  claim_count: number;
  pay_critical: number;
  pay_high: number;
  pay_medium: number;
  pay_low: number;
};

type Claim = {
  claim_id: string;
  seq: number;
  submitter: string;
  submitted_at: string;
  status: string;
  outcome: string;
  severity: string;
  claimed_severity: string;
  payout: number;
  escrowed: number;
  target_url: string;
  target_index: number;
  bond: number;
  bond_status: string;
  poc_text: string;
  patch_diff: string;
  reasoning: string;
  minority_note: string;
  case_id: string;
  merged_with: string;
};

export function CampaignDetail({
  account,
  campaignId,
  disabled,
  onBack,
}: {
  account: string;
  campaignId: string;
  disabled: boolean;
  onBack: () => void;
}) {
  const [cam, setCam] = useState<Campaign | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justSettled, setJustSettled] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [reps, setReps] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const c = await getCampaign(campaignId);
      setCam(c as Campaign);
      const ids = await getClaimsForCampaign(campaignId);
      const out: Claim[] = [];
      for (const id of ids) {
        const cl = await getClaim(id);
        if (cl && cl.claim_id) out.push(cl as Claim);
      }
      out.sort((a, b) => a.seq - b.seq);
      setClaims(out);
      const who = Array.from(new Set(out.map((c) => c.submitter.toLowerCase())));
      const rmap: Record<string, any> = {};
      for (const a of who) {
        try {
          rmap[a] = await getReputation(a);
        } catch {
          /* the record is informational; a failed read must not block the page */
        }
      }
      setReps(rmap);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSettledClaim = useCallback(
    async (claimId: string) => {
      setJustSettled(claimId);
      // reload a few times over the confirm window so the resolved state
      // lands before we clear the settling placeholder — no open-row flicker.
      await load();
      await new Promise((r) => setTimeout(r, 1500));
      await load();
      await new Promise((r) => setTimeout(r, 1500));
      await load();
      setJustSettled(null);
    },
    [load]
  );

  async function doResume() {
    setErr(null);
    setResuming(true);
    try {
      await resumeCampaign(campaignId);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setResuming(false);
    }
  }

  const openClaims = claims.filter((c) => c.status === "open");
  const resolvedClaims = claims.filter((c) => c.status !== "open");

  function bondLabel(cl: Claim): string {
    const b = cl.bond ?? 0;
    if (!b || cl.bond_status === "none") return "no bond";
    if (cl.bond_status === "locked") return "bond " + b + " locked";
    if (cl.bond_status === "returned") return "bond " + b + " returned";
    if (cl.bond_status === "forfeited") return "bond " + b + " forfeited to pool";
    return "bond " + b;
  }

  function repLabel(r: any): string {
    if (!r) return "";
    return (
      " | researcher record: " + r.rewarded + " rewarded, " + r.merged + " merged, " +
      r.rejected + " rejected, " + r.earned + " earned"
    );
  }

  function renderClaim(cl: Claim) {
    return (
      <div key={cl.claim_id} className="claimrow claimrow-sealed">
        <div className="claim-seal-col">
          <SeveritySeal
            status={cl.status}
            severity={cl.severity}
            outcome={cl.outcome}
            animate={justSettled === cl.claim_id}
          />
        </div>
        <div className="claim-main-col">
          <div className="claimrow-top">
            <span className="mono claim-id">{cl.claim_id}</span>
            <span className="seq mono">seq {cl.seq}</span>
            <span className="seq mono">target #{cl.target_index ?? 0}</span>
            {cl.outcome === "MergeDuplicate" ? (
              <span className="status status-merged">merged</span>
            ) : cl.status === "dismissed" ? (
              <span className="status status-dismissed">dismissed</span>
            ) : (
              <span className={"status status-" + cl.status}>{cl.status}</span>
            )}
          </div>
          <div className="claimrow-sub mono">
            by {cl.submitter.slice(0, 6)}…{cl.submitter.slice(-4)} · claimed{" "}
            {cl.claimed_severity}
            {cl.payout > 0 ? " · payout " + cl.payout : ""}
            {cl.escrowed > 0 ? " · escrow " + cl.escrowed : ""}
          </div>

          <div className="claimrow-sub mono">
            {bondLabel(cl)}
            {repLabel(reps[cl.submitter.toLowerCase()])}
          </div>

          <DisclosureTimeline
            status={cl.status}
            outcome={cl.outcome}
            severity={cl.severity}
            mergedWith={cl.merged_with}
          />

          {cl.status !== "open" && cl.reasoning && (
            <div className="claim-verdict">
              <div className="cv-reason">{cl.reasoning}</div>
              {cl.minority_note && (
                <div className="cv-minority">
                  <span className="v-label">minority</span> {cl.minority_note}
                </div>
              )}
              {cl.case_id && <div className="cv-case mono">{cl.case_id}</div>}
            </div>
          )}

          {cam && cam.status === "active" && cl.status === "open" && justSettled === cl.claim_id && (
            <div className="settling-panel mono">
              <span className="settling-dot" aria-hidden="true" />
              Finalizing settlement — updating on-chain state…
            </div>
          )}
          {cam && cam.status === "active" && cl.status === "open" && justSettled !== cl.claim_id && (
            <ClaimActions
              account={account}
              claim={cl}
              campaign={cam}
              siblingClaims={claims}
              disabled={disabled}
              onSettled={() => onSettledClaim(cl.claim_id)}
            />
          )}
          {cam && cl.status === "held" && (
            <ClaimActions
              account={account}
              claim={cl}
              campaign={cam}
              siblingClaims={claims}
              disabled={disabled}
              onSettled={() => onSettledClaim(cl.claim_id)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <button className="link back" onClick={onBack}>
        ← all campaigns
      </button>

      {loading && !cam && <div className="msg mono">Reading campaign…</div>}
      {err && <div className="error mono">{err}</div>}

      {cam && (
        <>
          <div className="detail-head">
            <span className="mono cam-id">{cam.campaign_id}</span>
            <span className={"status status-" + cam.status}>{cam.status}</span>
            {cam.is_critical_target && <span className="crit-flag">critical target</span>}
          </div>
          {(cam.targets ?? []).map((t, i) => (
            <div key={i} className="detail-url mono" title={t}>
              #{i} {t}
            </div>
          ))}
          <div className="detail-nums mono">claim bond {cam.bond ?? 0} genUSDC</div>
          <div className="detail-nums mono">
            pool {cam.pool} · escrowed {cam.escrowed} · paid {cam.paid_total} · claims{" "}
            {cam.claim_count}
          </div>

          <h3 className="claims-title">Open claims</h3>
          {openClaims.length === 0 && <div className="hint">No open claims.</div>}
          {openClaims.map(renderClaim)}

          {resolvedClaims.length > 0 && (
            <div className="resolved-section">
              <div
                className="resolved-head"
                onClick={() => setShowResolved((s) => !s)}
              >
                <span className="resolved-title mono">
                  Resolved ({resolvedClaims.length})
                </span>
                <span className="collapse-toggle mono">{showResolved ? "▾" : "▸"}</span>
              </div>
              {showResolved && <div className="resolved-body">{resolvedClaims.map(renderClaim)}</div>}
            </div>
          )}

          {cam.status === "active" && (
            <SubmitClaim
              account={account}
              campaignId={cam.campaign_id}
              targets={cam.targets ?? []}
              bond={cam.bond ?? 0}
              disabled={disabled}
              onSubmitted={load}
            />
          )}
          {cam.status === "paused" && (
            <div className="hint paused-note">
              Campaign paused (a critical claim escalated). No further submissions or
              settlement.
            </div>
          )}
          {cam.status === "paused" && (
            <button className="primary small" onClick={doResume} disabled={resuming}>
              {resuming ? "Resuming…" : "Resume campaign"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
