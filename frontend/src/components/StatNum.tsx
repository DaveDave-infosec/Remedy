import { useCountUp } from "../lib/reveal";

// V3 pillar 3: a stat that counts up once, for the landing stats row.
// suffix carries units the number itself should not own (for example "%").
export function StatNum({ value, suffix = "" }: { value: number; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <span className="lp-stat-num">
      {n}
      {suffix}
    </span>
  );
}
