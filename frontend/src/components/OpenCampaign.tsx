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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const poolNum = Number(pool);
  const insufficient = balance !== null && poolNum > balance;

  function setTargetAt(i: number, value: string) {
    setTargets((prev) => prev.map((t, j) => (j === i ? value : t)));
  }

  function addTarget() {
    setTargets((prev) => (prev.length >= MAX_TARGETS ? prev : [...prev, ""]));
  }

  function removeTarget(i: number) {
    setTargets((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
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
        isCritical
      );
      setTargets([""]);
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
            <button type="button" onClick={() => removeTarget(i)} disabled={busy}>
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
