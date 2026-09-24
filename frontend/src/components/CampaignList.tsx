import { useEffect, useState, useCallback } from "react";
import { getAllCampaignIds, getCampaign } from "../lib/contracts";
import { useCountUp } from "../lib/reveal";

type Campaign = {
  campaign_id: string;
  targets: string[];
  target_count: number;
  bond: number;
  pool: number;
  escrowed: number;
  paid_total: number;
  status: string;
  is_critical_target: boolean;
  claim_count: number;
};

const PIN_PREFIX = "https://raw.githubusercontent.com/";

function shortTarget(url: string): string {
  if (!url || !url.startsWith(PIN_PREFIX)) return url || "";
  const parts = url.slice(PIN_PREFIX.length).split("/");
  if (parts.length < 4) return url;
  return parts[0] + "/" + parts[1] + " @ " + parts[2].slice(0, 7) + " / " + parts.slice(3).join("/");
}

// One figure in the dashboard row. Counts up once so the numbers land with weight.
function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const n = useCountUp(value);
  return (
    <div className={"dash-stat" + (tone ? " dash-" + tone : "")}>
      <span className="dash-num">{n.toLocaleString()}</span>
      <span className="dash-label">{label}</span>
    </div>
  );
}

export function CampaignList({
  refreshKey,
  onSelect,
}: {
  refreshKey: number;
  onSelect: (campaignId: string) => void;
}) {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const ids = await getAllCampaignIds();
      const out: Campaign[] = [];
      for (const id of ids) {
        const c = await getCampaign(id);
        if (c && c.campaign_id) out.push(c as Campaign);
      }
      setRows(out);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const pooled = rows.reduce((t, c) => t + (c.pool || 0), 0);
  const escrowed = rows.reduce((t, c) => t + (c.escrowed || 0), 0);
  const paid = rows.reduce((t, c) => t + (c.paid_total || 0), 0);
  const claims = rows.reduce((t, c) => t + (c.claim_count || 0), 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Campaigns</h2>
        {rows.length > 0 && <span className="collapse-toggle mono">{rows.length}</span>}
      </div>

      {rows.length > 0 && (
        <div className="dash">
          <Stat label="locked in pools" value={pooled} />
          <Stat label="held in escrow" value={escrowed} tone="escrow" />
          <Stat label="paid to researchers" value={paid} tone="paid" />
          <Stat label="claims filed" value={claims} />
        </div>
      )}

      {loading && rows.length === 0 && <div className="msg mono">Reading campaigns...</div>}
      {err && <div className="error mono">{err}</div>}

      {!loading && rows.length === 0 && (
        <div className="empty">
          <div className="empty-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h3 className="empty-head">No campaigns yet</h3>
          <p className="empty-body">
            A campaign locks a bounty pool against up to ten commit-pinned contracts.
            Open one above, and researchers can file claims against any target in the set.
          </p>
        </div>
      )}

      <div className="cam-grid">
        {rows.map((c) => {
          const total = (c.pool || 0) + (c.escrowed || 0) + (c.paid_total || 0);
          const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
          const extra = Math.max(0, (c.targets ?? []).length - 1);
          return (
            <button
              key={c.campaign_id}
              type="button"
              className="cam-card lift"
              onClick={() => onSelect(c.campaign_id)}
            >
              <div className="cam-card-top">
                <span className="mono cam-id">{c.campaign_id}</span>
                <span className={"status status-" + c.status}>{c.status}</span>
                {c.is_critical_target && <span className="crit-flag">critical target</span>}
              </div>

              <div className="cam-target mono" title={(c.targets ?? [])[0] ?? ""}>
                {shortTarget((c.targets ?? [])[0] ?? "")}
                {extra > 0 ? " (+" + extra + " more)" : ""}
              </div>

              <div className="meter" aria-hidden="true">
                <span className="meter-pool" style={{ width: pct(c.pool) + "%" }} />
                <span className="meter-escrow" style={{ width: pct(c.escrowed) + "%" }} />
                <span className="meter-paid" style={{ width: pct(c.paid_total) + "%" }} />
              </div>

              <div className="cam-figs">
                <span className="cam-fig">
                  <em className="cam-fig-n">{(c.pool || 0).toLocaleString()}</em> pool
                </span>
                <span className="cam-fig cam-fig-escrow">
                  <em className="cam-fig-n">{(c.escrowed || 0).toLocaleString()}</em> escrowed
                </span>
                <span className="cam-fig cam-fig-paid">
                  <em className="cam-fig-n">{(c.paid_total || 0).toLocaleString()}</em> paid
                </span>
                <span className="cam-fig">
                  <em className="cam-fig-n">{c.claim_count || 0}</em> claims
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
