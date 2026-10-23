// Remedy keeper: the planning step.
//
// A pure function from on-chain state to an ordered list of actions. It never
// talks to the network, so every rule here is unit-tested offline
// (see plan.test.mjs). keeper.mjs reads the state and executes the plan.
//
// Every action is PERMISSIONLESS on the contracts: run_review, verify_fix,
// settle_claim and release_escrow can be called by anyone, and the contracts
// decide every outcome and amount. The keeper only removes the need for a
// person to press the button. It cannot dismiss, refund, or change a verdict.

export const ACTIONS = {
  settle: { contract: "vault", method: "settle_claim", slow: false, rank: 0 },
  release: { contract: "vault", method: "release_escrow", slow: false, rank: 1 },
  verify: { contract: "verifier", method: "verify_fix", slow: true, rank: 2 },
  review: { contract: "verifier", method: "run_review", slow: true, rank: 3 },
};

function claimNumber(id) {
  const n = Number(String(id).replace(/^clm_/, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function failureKey(kind, claimId) {
  return kind + ":" + claimId;
}

/**
 * @param {object} state
 *   campaigns: [{ campaign_id, status }]
 *   claims: [{ claim_id, campaign_id, status, case_id, patched_url, fix: { checked, fixed } }]
 *     case_id is the verifier's case for the claim ("" when not yet reviewed)
 * @param {object} opts
 *   maxWrites:   total writes this run
 *   maxSlow:     consensus-heavy writes (reviews, fix checks) this run
 *   failures:    { "<kind>:<claim>": count } carried over from earlier runs
 *   maxFailures: skip an action after this many reverts
 * @returns {{ actions: Array<{kind, claim_id, contract, method}>, skipped: Array<{kind, claim_id, reason}> }}
 */
export function planActions(state, opts = {}) {
  const maxWrites = opts.maxWrites ?? 6;
  const maxSlow = opts.maxSlow ?? 3;
  const failures = opts.failures ?? {};
  const maxFailures = opts.maxFailures ?? 3;

  const statusOf = new Map((state.campaigns ?? []).map((c) => [c.campaign_id, c.status]));
  const candidates = [];
  const skipped = [];

  for (const cl of state.claims ?? []) {
    const camStatus = statusOf.get(cl.campaign_id);
    const reviewed = typeof cl.case_id === "string" && cl.case_id !== "";

    let kind = null;
    if (cl.status === "open") {
      // a paused campaign settles nothing, so there is no point reviewing into it
      if (camStatus !== "active") {
        skipped.push({ kind: reviewed ? "settle" : "review", claim_id: cl.claim_id, reason: "campaign " + camStatus });
        continue;
      }
      kind = reviewed ? "settle" : "review";
    } else if (cl.status === "held") {
      const url = cl.patched_url ?? "";
      if (url === "") continue; // nothing submitted yet: only a person can propose a fix
      const fix = cl.fix ?? { checked: false, fixed: false };
      if (!fix.checked) kind = "verify";
      else if (fix.fixed) kind = "release";
      else continue; // judged not fixed: a new artifact must be submitted by a person
    } else {
      continue; // resolved claims need nothing
    }

    const fails = failures[failureKey(kind, cl.claim_id)] ?? 0;
    if (fails >= maxFailures) {
      skipped.push({ kind, claim_id: cl.claim_id, reason: "reverted " + fails + " times" });
      continue;
    }
    candidates.push({ kind, claim_id: cl.claim_id });
  }

  // cheap, money-moving actions first; then fix checks; then fresh reviews
  candidates.sort((a, b) => {
    const r = ACTIONS[a.kind].rank - ACTIONS[b.kind].rank;
    return r !== 0 ? r : claimNumber(a.claim_id) - claimNumber(b.claim_id);
  });

  const actions = [];
  let slow = 0;
  for (const c of candidates) {
    if (actions.length >= maxWrites) {
      skipped.push({ ...c, reason: "write cap reached" });
      continue;
    }
    const spec = ACTIONS[c.kind];
    if (spec.slow && slow >= maxSlow) {
      skipped.push({ ...c, reason: "slow-action cap reached" });
      continue;
    }
    if (spec.slow) slow += 1;
    actions.push({ ...c, contract: spec.contract, method: spec.method });
  }
  return { actions, skipped };
}
