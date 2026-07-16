import { useState } from "react";
import { openCampaign } from "../lib/contracts";

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
  const [targetUrl, setTargetUrl] = useState("");
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

  async function submit() {
    setErr(null);
    setMsg(null);
    if (targetUrl.trim() === "") {
      setErr("Target URL is required.");
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
    setMsg("Opening campaign on-chain — this takes a few seconds…");
    try {
      await openCampaign(
        targetUrl.trim(),
        poolNum,
        Number(payCritical),
        Number(payHigh),
        Number(payMedium),
        Number(payLow),
        isCritical
      );
      setTargetUrl("");
      // hold busy through the reload so the list shows the new campaign
      // before the button resets — no revert/manual-refresh flicker.
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
        Lock a bounty pool against a target contract. Researchers submit claims;
        consensus settles them.
      </p>

      <label>Target contract source URL</label>
      <input
        type="text"
        value={targetUrl}
        placeholder="https://raw.githubusercontent.com/…/Contract.sol"
        onChange={(e) => setTargetUrl(e.target.value)}
      />

      <label>Bounty pool (genUSDC)</label>
      <input type="number" value={pool} onChange={(e) => setPool(e.target.value)} />
      {insufficient && (
        <div className="inline-warn mono">
          Pool exceeds your balance ({balance} genUSDC). Claim the faucet or lower the pool.
        </div>
      )}

      <div className="grid4">
        <div>
          <label>Critical</label>
          <input type="number" value={payCritical} onChange={(e) => setPayCritical(e.target.value)} />
        </div>
        <div>
          <label>High</label>
          <input type="number" value={payHigh} onChange={(e) => setPayHigh(e.target.value)} />
        </div>
        <div>
          <label>Medium</label>
          <input type="number" value={payMedium} onChange={(e) => setPayMedium(e.target.value)} />
        </div>
        <div>
          <label>Low</label>
          <input type="number" value={payLow} onChange={(e) => setPayLow(e.target.value)} />
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={isCritical}
          onChange={(e) => setIsCritical(e.target.checked)}
        />
        Predefined critical target (credible Critical claims escalate & pause the campaign)
      </label>

      <button className="primary" onClick={submit} disabled={disabled || busy || insufficient}>
        {busy ? "Opening…" : "Open campaign"}
      </button>

      {msg && <div className="msg mono">{msg}</div>}
      {err && <div className="error mono">{err}</div>}
    </div>
  );
}
