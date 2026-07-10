import { useEffect, useState, useCallback } from "react";
import { getAllCampaignIds, getCampaign } from "../lib/contracts";

type Campaign = {
  campaign_id: string;
  target_url: string;
  pool: number;
  escrowed: number;
  paid_total: number;
  status: string;
  is_critical_target: boolean;
  claim_count: number;
};

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
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <div className="panel">
      <div className="panel-head" onClick={() => setCollapsed((c) => !c)}>
        <h2>Campaigns</h2>
        <span className="collapse-toggle mono">
          {rows.length > 0 ? "(" + rows.length + ")" : ""} {collapsed ? "▸" : "▾"}
        </span>
      </div>

      {!collapsed && (
        <>
          {loading && <div className="msg mono">Reading campaigns…</div>}
          {err && <div className="error mono">{err}</div>}
          {!loading && rows.length === 0 && (
            <div className="hint">No campaigns yet. Open one above to begin.</div>
          )}
          {rows.map((c) => (
            <div key={c.campaign_id} className="camrow" onClick={() => onSelect(c.campaign_id)}>
              <div className="camrow-top">
                <span className="mono cam-id">{c.campaign_id}</span>
                <span className={"status status-" + c.status}>{c.status}</span>
                {c.is_critical_target && <span className="crit-flag">critical target</span>}
              </div>
              <div className="camrow-url mono">{c.target_url}</div>
              <div className="camrow-nums mono">
                pool {c.pool} · escrowed {c.escrowed} · paid {c.paid_total} · claims{" "}
                {c.claim_count}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
