import { useState } from "react";
import { openCampaign } from "../lib/contracts";

// V3 pillar 1: a campaign covers a SET of commit-pinned targets (max 10).
// Claims later pick a target by its index, so the index is shown on each row.
const MAX_TARGETS = 10;
const PIN_RE = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-fA-F]{40}\/.+$/;

export function OpenCampaign({
  account,
  balance,
  disabled,
  onOpened,
}: {
  account: string;
  balance: number | null;
  disabled: boolean;
  onOpened: () => void | Promise<void>;
}) {
  void account;
  const [targets, setTargets] = useState<string[]>([""]);
  const [pool, setPool] = useState("20000");
  const [payCritical, setPayCritical] = useState("10000");
  const [payHigh, setPayHigh] = useState("5000");
  const [payMedium, setPayMedium] = useState("2000");
  const [payLow, setPayLow] = useState("500");
  const [isCritical, setIsCritical] = useState(false);
  const [bond, setBond] = useState("100");
  // V4: optional per-target schedules, one [critical, high, medium, low] row per
  // target. Off means every target uses the campaign schedule above.
  const [perTarget, setPerTarget] = useState(false);
  const [tierRows, setTierRows] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const poolNum = Number(pool);
  const insufficient = balance !== null && poolNum > balance;

  function setTargetAt(i: number, value: string) {
    setTargets((prev) => prev.map((t, j) => (j === i ? value : t)));
  }

  const defaultsRow = () => [payCritical, payHigh, payMedium, payLow];

  function addTarget() {
    if (targets.length >= MAX_TARGETS) return;
    setTargets((prev) => [...prev, ""]);
    setTierRows((prev) => [...prev, defaultsRow()]);
  }

  function removeTarget(i: number) {
    if (targets.length <= 1) return;
    setTargets((prev) => prev.filter((_, j) => j !== i));
    setTierRows((prev) => prev.filter((_, j) => j !== i));
  }

  function togglePerTarget(on: boolean) {
    // start every row from the campaign schedule, so turning it on changes nothing
    // until a value is edited
    if (on) setTierRows(targets.map(() => defaultsRow()));
    setPerTarget(on);
  }

  function setTierAt(row: number, col: number, value: string) {
    setTierRows((prev) => prev.map((r, i) => (i === row ? r.map((v, j) => (j === col ? value : v)) : r)));
  }

  async function submit() {
    setErr(null);
    setMsg(null);
    const cleaned = targets.map((t) => t.trim());
    const emptyIdx = cleaned.findIndex((t) => t === "");
    if (emptyIdx >= 0) {
      setErr("Target #" + emptyIdx + " is empty. Fill it in or remove that row.");
      return;
    }
    const badIdx = cleaned.findIndex((t) => !PIN_RE.test(t));
    if (badIdx >= 0) {
      setErr(
        "Target #" +
          badIdx +
          " is not commit-pinned. Use https://raw.githubusercontent.com/<owner>/<repo>/<40-character commit sha>/<path>. A branch URL can change after a claim is filed."
      );
      return;
    }
    if (new Set(cleaned).size !== cleaned.length) {
      setErr("The same target URL appears more than once. Each target must be distinct.");
      return;
    }
    if (poolNum <= 0) {
      setErr("Bounty pool must be a positive amount.");
      return;
    }
    const bondNum = Number(bond);
    if (!Number.isInteger(bondNum) || bondNum < 0) {
      setErr("Claim bond must be a whole number of 0 or more.");
      return;
    }
    const defaults = [payCritical, payHigh, payMedium, payLow].map(Number);
    if (defaults.some((x) => !Number.isInteger(x) || x < 0)) {
      setErr("Every severity payout must be a whole number of 0 or more.");
      return;
    }
    let targetTiers: number[][] = [];
    if (perTarget) {
      targetTiers = tierRows.slice(0, cleaned.length).map((r) => r.map(Number));
      const badRow = targetTiers.findIndex((r) => r.length !== 4 || r.some((x) => !Number.isInteger(x) || x < 0));
      if (badRow >= 0 || targetTiers.length !== cleaned.length) {
        setErr(
          "Target #" + Math.max(badRow, 0) + " has a payout that is not a whole number of 0 or more."
        );
        return;
      }
    }
    if (insufficient) {
      setErr(
        "Insufficient balance: your pool of " +
          poolNum +
          " genUSDC exceeds your balance of " +
          balance +
          ". Claim the faucet or lower the pool."
      );
      return;
    }
    setBusy(true);
    setMsg("Opening campaign on-chain, this takes a few seconds...");
    try {
      await openCampaign(
        cleaned,
        poolNum,
        Number(payCritical),
        Number(payHigh),
        Number(payMedium),
        Number(payLow),
        isCritical,
        Number(bond),
        targetTiers
      );
      setTargets([""]);
      setTierRows([]);
      setPerTarget(false);
      // hold busy through the reload so the list shows the new campaign
      // before the button resets (no revert/manual-refresh flicker).
      await onOpened();
      setMsg(null);
      setBusy(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setMsg(null);
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Open a security campaign</h2>
      <p className="hint">
        Lock a bounty pool against one or more target contracts (up to {MAX_TARGETS}).
        Researchers file each claim against a specific target; consensus settles them.
      </p>

      <label>Target contract source URLs (commit-pinned)</label>
      {targets.map((t, i) => (
        <div
          key={i}
          className="target-row"
          style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}
        >
          <span className="mono" style={{ minWidth: "3.5em" }}>
            #{i}
          </span>
          <input
            type="text"
            value={t}
            style={{ flex: 1 }}
            placeholder="https://raw.githubusercontent.com/<owner>/<repo>/<commit sha>/Contract.sol"
            onChange={(e) => setTargetAt(i, e.target.value)}
            disabled={busy}
          />
          {targets.length > 1 && (
            <button type="button" className="btn-secondary" onClick={() => removeTarget(i)} disabled={busy}>
              Remove
            </button>
          )}
        </div>
      ))}
      {targets.length < MAX_TARGETS && (
        <button type="button" className="btn-secondary" onClick={addTarget} disabled={busy}>
          + Add target
        </button>
      )}

      <label>Bounty pool (genUSDC)</label>
      <input type="number" value={pool} onChange={(e) => setPool(e.target.value)} />
      {insufficient && (
        <div className="inline-warn mono">
          Pool exceeds your balance ({balance} genUSDC). Claim the faucet or lower the pool.
        </div>
      )}

      <label>Claim bond (genUSDC)</label>
      <input type="number" min={0} value={bond} onChange={(e) => setBond(e.target.value)} />
      <div className="hint">
        Each claim locks this bond. It comes back on any credible outcome and is
        forfeited to the bounty pool on Reject. Set 0 for no bond.
      </div>

      <div className="grid4">
        <div>
          <label className="pay-crit">Critical</label>
          <input type="number" value={payCritical} onChange={(e) => setPayCritical(e.target.value)} />
        </div>
        <div>
          <label className="pay-high">High</label>
          <input type="number" value={payHigh} onChange={(e) => setPayHigh(e.target.value)} />
        </div>
        <div>
          <label className="pay-med">Medium</label>
          <input type="number" value={payMedium} onChange={(e) => setPayMedium(e.target.value)} />
        </div>
        <div>
          <label className="pay-low">Low</label>
          <input type="number" value={payLow} onChange={(e) => setPayLow(e.target.value)} />
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={perTarget}
          onChange={(e) => togglePerTarget(e.target.checked)}
          disabled={busy}
        />
        Set a different payout schedule for each target (fixed once the campaign opens)
      </label>

      {perTarget && (
        <div className="tier-table">
          <div className="tier-head mono">
            <span />
            <span className="pay-crit">Critical</span>
            <span className="pay-high">High</span>
            <span className="pay-med">Medium</span>
            <span className="pay-low">Low</span>
          </div>
          {targets.map((_, i) => (
            <div key={i} className="tier-row">
              <span className="mono">#{i}</span>
              {[0, 1, 2, 3].map((j) => (
                <input
                  key={j}
                  type="number"
                  min={0}
                  value={(tierRows[i] ?? [])[j] ?? ""}
                  onChange={(e) => setTierAt(i, j, e.target.value)}
                  disabled={busy}
                />
              ))}
            </div>
          ))}
          <div className="hint">
            A claim is always paid from the schedule of its primary target, even if it
            cites a second, more expensive one.
          </div>
        </div>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={isCritical}
          onChange={(e) => setIsCritical(e.target.checked)}
        />
        Predefined critical target (credible Critical claims escalate and pause the campaign)
      </label>

      <button className="primary" onClick={submit} disabled={disabled || busy || insufficient}>
        {busy ? "Opening..." : "Open campaign"}
      </button>

      {msg && <div className="msg mono">{msg}</div>}
      {err && <div className="error mono">{err}</div>}
    </div>
  );
}
