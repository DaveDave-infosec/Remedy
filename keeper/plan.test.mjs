import { test } from "node:test";
import assert from "node:assert/strict";
import { planActions, failureKey } from "./plan.mjs";

const active = { campaign_id: "cam_0", status: "active" };
const paused = { campaign_id: "cam_1", status: "paused" };

function claim(id, over = {}) {
  return { claim_id: id, campaign_id: "cam_0", status: "open", case_id: "", patched_url: "", fix: { checked: false, fixed: false }, ...over };
}

const kinds = (r) => r.actions.map((a) => a.kind + ":" + a.claim_id);

test("an unreviewed open claim is reviewed", () => {
  const r = planActions({ campaigns: [active], claims: [claim("clm_0")] });
  assert.deepEqual(kinds(r), ["review:clm_0"]);
  assert.equal(r.actions[0].contract, "verifier");
  assert.equal(r.actions[0].method, "run_review");
});

test("a reviewed open claim is settled on the vault", () => {
  const r = planActions({ campaigns: [active], claims: [claim("clm_0", { case_id: "remedy_0" })] });
  assert.deepEqual(kinds(r), ["settle:clm_0"]);
  assert.equal(r.actions[0].contract, "vault");
});

test("a held claim with an unjudged artifact gets a fix check", () => {
  const r = planActions({
    campaigns: [active],
    claims: [claim("clm_0", { status: "held", patched_url: "https://x" })],
  });
  assert.deepEqual(kinds(r), ["verify:clm_0"]);
});

test("a held claim whose artifact is judged fixed is released", () => {
  const r = planActions({
    campaigns: [active],
    claims: [claim("clm_0", { status: "held", patched_url: "https://x", fix: { checked: true, fixed: true } })],
  });
  assert.deepEqual(kinds(r), ["release:clm_0"]);
});

test("the keeper never proposes a fix and never retries a judged not-fixed artifact", () => {
  const r = planActions({
    campaigns: [active],
    claims: [
      claim("clm_0", { status: "held", patched_url: "" }),
      claim("clm_1", { status: "held", patched_url: "https://x", fix: { checked: true, fixed: false } }),
    ],
  });
  assert.deepEqual(kinds(r), []);
});

test("resolved claims are left alone", () => {
  const r = planActions({
    campaigns: [active],
    claims: ["rewarded", "rejected", "dismissed", "escalated"].map((s, i) => claim("clm_" + i, { status: s, case_id: "remedy_" + i })),
  });
  assert.deepEqual(kinds(r), []);
});

test("nothing is reviewed or settled in a paused campaign", () => {
  const r = planActions({
    campaigns: [active, paused],
    claims: [claim("clm_0", { campaign_id: "cam_1" }), claim("clm_1", { campaign_id: "cam_1", case_id: "remedy_0" })],
  });
  assert.deepEqual(kinds(r), []);
  assert.equal(r.skipped.length, 2);
});

test("cheap money-moving actions run before slow consensus actions", () => {
  const r = planActions({
    campaigns: [active],
    claims: [
      claim("clm_0"),
      claim("clm_1", { status: "held", patched_url: "https://x" }),
      claim("clm_2", { status: "held", patched_url: "https://y", fix: { checked: true, fixed: true } }),
      claim("clm_3", { case_id: "remedy_9" }),
    ],
  });
  assert.deepEqual(kinds(r), ["settle:clm_3", "release:clm_2", "verify:clm_1", "review:clm_0"]);
});

test("the slow-action cap bounds reviews per run, oldest claims first", () => {
  const r = planActions(
    { campaigns: [active], claims: ["clm_10", "clm_2", "clm_7", "clm_1"].map((id) => claim(id)) },
    { maxSlow: 2 }
  );
  assert.deepEqual(kinds(r), ["review:clm_1", "review:clm_2"]);
  assert.equal(r.skipped.filter((s) => s.reason === "slow-action cap reached").length, 2);
});

test("the total write cap holds even for cheap actions", () => {
  const claims = Array.from({ length: 9 }, (_, i) => claim("clm_" + i, { case_id: "remedy_" + i }));
  const r = planActions({ campaigns: [active], claims }, { maxWrites: 4 });
  assert.equal(r.actions.length, 4);
});

test("an action that keeps reverting is skipped after the failure limit", () => {
  const failures = { [failureKey("review", "clm_0")]: 3, [failureKey("review", "clm_1")]: 2 };
  const r = planActions({ campaigns: [active], claims: [claim("clm_0"), claim("clm_1")] }, { failures, maxFailures: 3 });
  assert.deepEqual(kinds(r), ["review:clm_1"]);
  assert.match(r.skipped[0].reason, /reverted 3 times/);
});
