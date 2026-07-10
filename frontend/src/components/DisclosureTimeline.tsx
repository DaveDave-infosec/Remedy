type Node = {
  label: string;
  state: "done" | "current" | "future";
  tone?: "normal" | "crit" | "escrow" | "void" | "paid";
};

function sevTone(sev: string): "crit" | "normal" {
  return sev.toLowerCase() === "critical" ? "crit" : "normal";
}

// Build the true lifecycle for a claim from its status/outcome.
function buildNodes(status: string, outcome: string, severity: string): Node[] {
  const done = (label: string, tone: Node["tone"] = "normal"): Node => ({
    label,
    state: "done",
    tone,
  });

  // Open claim: only Submitted is done; the rest are ahead.
  if (status === "open") {
    return [
      { label: "Submitted", state: "done" },
      { label: "Reviewed", state: "current" },
      { label: "Severity set", state: "future" },
      { label: "Settled", state: "future" },
    ];
  }

  // Resolved claims: walk the true path by outcome.
  if (outcome === "Reject") {
    return [
      done("Submitted"),
      done("Reviewed"),
      { label: "Not credible", state: "done", tone: "void" },
      { label: "Dismissed", state: "done", tone: "void" },
    ];
  }

  if (outcome === "Dismissed") {
    return [
      done("Submitted"),
      { label: "Withdrawn", state: "done", tone: "void" },
    ];
  }

  if (outcome === "Escalate") {
    return [
      done("Submitted"),
      done("Reviewed"),
      done("Severity set", "crit"),
      { label: "Escalated", state: "done", tone: "crit" },
    ];
  }

  if (outcome === "HoldForPatch") {
    return [
      done("Submitted"),
      done("Reviewed"),
      done("Severity set", sevTone(severity)),
      { label: "Patch held", state: "done", tone: "escrow" },
      { label: "Awaiting fix", state: "current", tone: "escrow" },
    ];
  }

  if (outcome === "MergeDuplicate") {
    return [
      done("Submitted"),
      done("Reviewed"),
      done("Severity set", sevTone(severity)),
      { label: "Merged & paid", state: "done", tone: "paid" },
    ];
  }

  // Reward (default resolved)
  return [
    done("Submitted"),
    done("Reviewed"),
    done("Severity set", sevTone(severity)),
    { label: "Settled", state: "done", tone: "paid" },
  ];
}

export function DisclosureTimeline({
  status,
  outcome,
  severity,
  mergedWith,
}: {
  status: string;
  outcome: string;
  severity: string;
  mergedWith?: string;
}) {
  const nodes = buildNodes(status, outcome, severity);

  return (
    <div className="timeline" role="group" aria-label="Disclosure timeline">
      <div className="timeline-track">
        {nodes.map((n, i) => (
          <div key={i} className={"tl-node tl-" + n.state + " tl-tone-" + (n.tone ?? "normal")}>
            <span className="tl-dot" aria-hidden="true" />
            <span className="tl-label">{n.label}</span>
            {i < nodes.length - 1 && <span className="tl-conn" aria-hidden="true" />}
          </div>
        ))}
      </div>
      {outcome === "MergeDuplicate" && mergedWith && (
        <div className="tl-merge mono">merged ← {mergedWith}</div>
      )}
    </div>
  );
}
