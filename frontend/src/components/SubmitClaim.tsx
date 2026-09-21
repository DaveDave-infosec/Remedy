import { useState } from "react";
import { submitClaim } from "../lib/contracts";

// V3 pillar 1: a campaign covers a SET of commit-pinned targets. The researcher
// picks WHICH target the claim is against; only the index is sent, and the vault
// resolves the URL canonically (the caller never supplies a URL).
const PIN_PREFIX = "https://raw.githubusercontent.com/";

export function shortTarget(url: string): string {
  if (!url.startsWith(PIN_PREFIX)) return url;
  const parts = url.slice(PIN_PREFIX.length).split("/");
  if (parts.length < 4) return url;
  const path = parts.slice(3).join("/");
  return parts[0] + "/" + parts[1] + " @ " + parts[2].slice(0, 7) + " / " + path;
}

export function SubmitClaim({
  account,
  campaignId,
  targets,
  disabled,
  onSubmitted,
}: {
  account: string;
  campaignId: string;
  targets: string[];
  disabled: boolean;
  onSubmitted: () => void | Promise<void>;
}) {
  void account;
  const [targetIndex, setTargetIndex] = useState(0);
  const [poc, setPoc] = useState("");
  const [patch, setPatch] = useState("");
  const [severity, setSeverity] = useState("High");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const noTargets = targets.length === 0;
  const safeIndex = targetIndex >= 0 && targetIndex < targets.length ? targetIndex : 0;

  async function submit() {
    setErr(null);
    setMsg(null);
    if (noTargets) {
      setErr("This campaign has no targets, so no claim can be filed against it.");
      return;
    }
    if (poc.trim() === "") {
      setErr("A proof-of-concept description is required.");
      return;
    }
    setBusy(true);
    setMsg("Submitting claim on-chain, this takes a few seconds...");
    try {
      const submittedAt = new Date().toISOString();
      await submitClaim(
        campaignId,
        submittedAt,
        safeIndex,
        poc.trim(),
        patch.trim(),
        severity
      );
      // hold the busy state through the reload so the button stays
      // "Submitting..." (disabled) until the new claim actually appears.
      // This prevents a confused double-submit during chain confirmation.
      setPoc("");
      setPatch("");
      await onSubmitted();
      setMsg(null);
      setBusy(false);
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const netlike =
        raw.toLowerCase().includes("fetch") ||
        raw.toLowerCase().includes("network") ||
        raw.toLowerCase().includes("timeout");
      if (netlike) {
        // The node did not confirm, but the claim may still have landed on-chain.
        // Refresh the list so it becomes visible, and warn against a re-submit.
        try {
          await onSubmitted();
        } catch {}
        setErr(
          "The node did not respond. Your claim may still have been submitted. Check the claims list above before submitting again."
        );
      } else {
        setErr(raw);
      }
      setMsg(null);
      setBusy(false);
    }
  }

  return (
    <div className="subpanel">
      <h3>Submit a claim</h3>
      <p className="hint">
        Evidence locks at intake. Pick the campaign target your claim is against;
        its commit-pinned source is fixed by the campaign. You provide the
        proof-of-concept and an optional patch.
      </p>

      <label>Target contract</label>
      {noTargets ? (
        <div className="error mono">This campaign has no targets.</div>
      ) : targets.length === 1 ? (
        <div className="mono" title={targets[0]}>
          #0 {shortTarget(targets[0])}
        </div>
      ) : (
        <select
          value={safeIndex}
          onChange={(e) => setTargetIndex(Number(e.target.value))}
          disabled={busy}
        >
          {targets.map((t, i) => (
            <option key={i} value={i} title={t}>
              #{i} {shortTarget(t)}
            </option>
          ))}
        </select>
      )}

      <label>Proof-of-concept (describe the vulnerability and how it triggers)</label>
      <textarea
        rows={5}
        value={poc}
        placeholder="e.g. Reentrancy in withdraw(): the external call runs before the balance is decremented..."
        onChange={(e) => setPoc(e.target.value)}
      />

      <label>Proposed patch diff (optional, routes to Hold-for-Patch)</label>
      <textarea
        rows={5}
        className="mono"
        value={patch}
        placeholder="--- a/Contract.sol&#10;+++ b/Contract.sol&#10;@@ ..."
        onChange={(e) => setPatch(e.target.value)}
      />

      <label>Claimed severity (a hint; consensus sets the real one)</label>
      <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
        <option>Critical</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
      </select>

      <button className="primary" onClick={submit} disabled={disabled || busy || noTargets}>
        {busy ? "Submitting..." : "Submit claim"}
      </button>

      {msg && <div className="msg mono">{msg}</div>}
      {err && <div className="error mono">{err}</div>}
    </div>
  );
}
