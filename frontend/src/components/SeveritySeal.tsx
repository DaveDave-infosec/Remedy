type SealState = "pending" | "struck";

function sevColor(sev: string): string {
  const s = sev.toLowerCase();
  if (s === "critical") return "#C4453B";
  if (s === "high") return "#C77B3C";
  if (s === "medium") return "#C9A94E";
  if (s === "low") return "#5E8A6F";
  return "#8A8F94";
}

function sevLabel(sev: string): string {
  const s = sev.toLowerCase();
  if (s === "critical") return "CRIT";
  if (s === "high") return "HIGH";
  if (s === "medium") return "MED";
  if (s === "low") return "LOW";
  return "VOID";
}

// outcome → what the seal reads. Reject = VOID (struck, grey). Others carry severity.
export function SeveritySeal({
  status,
  severity,
  outcome,
  animate,
  size = 72,
}: {
  status: string;
  severity: string;
  outcome: string;
  animate?: boolean;
  size?: number;
}) {
  const state: SealState = status === "open" ? "pending" : "struck";
  const isVoid = outcome === "Reject" || outcome === "Dismissed";
  const color = isVoid ? "#8A8F94" : sevColor(severity);
  const label = isVoid ? "VOID" : sevLabel(severity);

  const outer = "-40,-16 -16,-40 16,-40 40,-16 40,16 16,40 -16,40 -40,16";
  const inner = "-31,-12.5 -12.5,-31 12.5,-31 31,-12.5 31,12.5 12.5,31 -12.5,31 -31,12.5";

  return (
    <svg
      className={"seal " + (state === "struck" && animate ? "seal-strike" : "")}
      width={size}
      height={size}
      viewBox="-48 -48 96 96"
      role="img"
      aria-label={
        state === "pending"
          ? "Severity seal: pending, claim open"
          : "Severity seal: struck, " + (isVoid ? "void" : severity)
      }
    >
      {state === "pending" ? (
        <>
          <polygon points={outer} fill="none" stroke="#3A424C" strokeWidth="1.5" />
          <polygon
            points={inner}
            fill="none"
            stroke="#2A3038"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x="0"
            y="-3"
            fill="#8A8F94"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="9"
            letterSpacing="1.5"
            textAnchor="middle"
          >
            PENDING
          </text>
          <text
            x="0"
            y="10"
            fill="#5A5F64"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="8"
            letterSpacing="1"
            textAnchor="middle"
          >
            seal
          </text>
        </>
      ) : (
        <>
          <polygon points={outer} fill={color} stroke={color} strokeWidth="2" />
          <polygon points={inner} fill="none" stroke="#14171A" strokeWidth="1" />
          <text
            x="0"
            y="-2"
            fill="#14171A"
            fontFamily="'Archivo', sans-serif"
            fontWeight="800"
            fontSize={label.length > 3 ? "10" : "11"}
            letterSpacing="0.5"
            textAnchor="middle"
          >
            {label}
          </text>
          <text
            x="0"
            y="12"
            fill="#14171A"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="7"
            letterSpacing="1"
            textAnchor="middle"
          >
            {isVoid ? "DISMISSED" : "SEALED"}
          </text>
        </>
      )}
    </svg>
  );
}
