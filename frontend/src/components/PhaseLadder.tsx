const PHASES = [
  "Intake & dedup",
  "Assessing credibility",
  "Setting severity",
  "Evaluating patch",
  "Consensus & settlement",
];

export function PhaseLadder({ active }: { active: number }) {
  return (
    <div className="ladder" role="status" aria-label="Review progress">
      {PHASES.map((label, i) => {
        const state = i < active ? "done" : i === active ? "current" : "future";
        const mark = i < active ? "✓" : i === active ? "▸" : "·";
        return (
          <div key={i} className={"ladder-row ladder-" + state}>
            <span className="ladder-mark mono" aria-hidden="true">
              {mark}
            </span>
            <span className="ladder-label mono">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
