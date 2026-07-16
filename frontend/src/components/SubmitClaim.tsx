import { useState } from "react";
import { submitClaim } from "../lib/contracts";

export function SubmitClaim({
  account,
  campaignId,
  targetUrl,
  disabled,
  onSubmitted,
}: {
  account: string;
  campaignId: string;
  targetUrl: string;
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const [poc, setPoc] = useState("");
  const [patch, setPatch] = useState("");
  const [severity, setSeverity] = useState("High");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setMsg(null);
    if (poc.trim() === "") {
      setErr("A proof-of-concept description is required.");
      return;
    }
    setBusy(true);
    setMsg("Submitting claim on-chain — this takes a few seconds…");
    try {
      const submittedAt = new Date().toISOString();
      await submitClaim(
        campaignId,
        submittedAt,
        targetUrl,
        poc.trim(),
        patch.trim(),
        severity
      );
      // hold the busy state through the reload so the button stays
      // "Submitting…" (disabled) until the new claim actually appears —
      // prevents a confused double-submit during chain confirmation.
      setPoc("");
      setPatch("");
      await onSubmitted();
      setMsg(null);
      setBusy(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setMsg(null);
      setBusy(false);
    }
  }

  return (
    <div className="subpanel">
      <h3>Submit a claim</h3>
      <p className="hint">
        Evidence locks at intake. The target source is fixed by the campaign; you
        provide the proof-of-concept and an optional patch.
      </p>

      <label>Proof-of-concept (describe the vulnerability & how it triggers)</label>
      <textarea
        rows={5}
        value={poc}
        placeholder="e.g. Reentrancy in withdraw(): the external call runs before the balance is decremented…"
        onChange={(e) => setPoc(e.target.value)}
      />

      <label>Proposed patch diff (optional — routes to Hold-for-Patch)</label>
      <textarea
        rows={5}
        className="mono"
        value={patch}
        placeholder="--- a/Contract.sol&#10;+++ b/Contract.sol&#10;@@ …"
        onChange={(e) => setPatch(e.target.value)}
      />

      <label>Claimed severity (a hint — consensus sets the real one)</label>
      <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
        <option>Critical</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
      </select>

      <button className="primary" onClick={submit} disabled={disabled || busy}>
        {busy ? "Submitting…" : "Submit claim"}
      </button>

      {msg && <div className="msg mono">{msg}</div>}
      {err && <div className="error mono">{err}</div>}
    </div>
  );
}
