// Execution tests for the keeper against a simulated chain.
//
// The fake client mimics genlayer-js: reads return Maps for dicts (as the real
// client can), writes return a hash, and receipts carry the same
// consensus_data.leader_receipt shape the real network returns, including a
// reverted call whose result is base64("\x01" + message).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOnce } from "./keeper.mjs";

const ADDR = { vault: "0xVAULT", verifier: "0xVERIFIER" };
const ACCOUNT = { address: "0xKEEPER" };

function fakeChain(initial, { revert = {}, transientWrites = 0 } = {}) {
  const chain = structuredClone(initial);
  const sent = [];
  const outcomes = new Map();
  let flaky = transientWrites;
  let n = 0;

  const asMap = (o) => new Map(Object.entries(o));

  const client = {
    async readContract({ address, functionName, args }) {
      const [a, b] = args ?? [];
      if (address === ADDR.vault) {
        if (functionName === "get_all_campaign_ids") return Object.keys(chain.campaigns);
        if (functionName === "get_campaign") return asMap(chain.campaigns[a]);
        if (functionName === "get_claims_for_campaign")
          return Object.keys(chain.claims).filter((id) => chain.claims[id].campaign_id === a);
        if (functionName === "get_claim") return asMap(chain.claims[a]);
      }
      if (address === ADDR.verifier) {
        if (functionName === "get_case_for_claim") return chain.cases[a] ?? "";
        if (functionName === "get_fix_result") return asMap(chain.fixes[a + "|" + b] ?? { checked: false, fixed: false });
      }
      throw new Error("unexpected read " + functionName);
    },

    async writeContract({ address, functionName, args }) {
      if (flaky > 0) {
        flaky -= 1;
        throw new Error("Failed to fetch");
      }
      const id = args[0];
      const hash = "0x" + String(++n).padStart(64, "0");
      sent.push({ address, functionName, id });
      const why = revert[functionName + ":" + id];
      if (why) {
        outcomes.set(hash, why);
        return hash;
      }
      // apply what the real contracts would do on success
      const cl = chain.claims[id];
      if (functionName === "run_review") chain.cases[id] = "remedy_" + id;
      if (functionName === "settle_claim") cl.status = cl.next_status ?? "rewarded";
      if (functionName === "verify_fix") chain.fixes[id + "|" + cl.patched_url] = { checked: true, fixed: cl.fix_will_be ?? true };
      if (functionName === "release_escrow") cl.status = "rewarded";
      return hash;
    },

    async waitForTransactionReceipt({ hash }) {
      const why = outcomes.get(hash);
      const leader = why
        ? { execution_result: "ERROR", result: Buffer.from("\x01" + why, "latin1").toString("base64") }
        : { execution_result: "SUCCESS" };
      return { consensus_data: { leader_receipt: [leader] } };
    },
  };
  return { client, chain, sent };
}

function env(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "keeper-"));
  return { KEEPER_STATE: join(dir, "state.json"), WAIT_RETRIES: "1", ...extra };
}

const base = () => ({
  campaigns: { cam_0: { status: "active" } },
  claims: {},
  cases: {},
  fixes: {},
});

test("a claim is reviewed on one run and settled on the next", async () => {
  const init = base();
  init.claims.clm_0 = { campaign_id: "cam_0", status: "open", patched_url: "" };
  const { client, chain, sent } = fakeChain(init);
  const e = env();

  await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.deepEqual(sent.map((s) => s.functionName + ":" + s.id), ["run_review:clm_0"]);
  assert.equal(sent[0].address, ADDR.verifier);

  await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.deepEqual(sent.map((s) => s.functionName), ["run_review", "settle_claim"]);
  assert.equal(sent[1].address, ADDR.vault);
  assert.equal(chain.claims.clm_0.status, "rewarded");

  // a third run has nothing left to do
  await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.equal(sent.length, 2);
});

test("a held claim's artifact is checked, then its escrow is released", async () => {
  const init = base();
  init.claims.clm_3 = { campaign_id: "cam_0", status: "held", patched_url: "https://fix" };
  const { client, chain, sent } = fakeChain(init);
  const e = env();
  await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.deepEqual(sent.map((s) => s.functionName), ["verify_fix", "release_escrow"]);
  assert.equal(chain.claims.clm_3.status, "rewarded");
});

test("a fix judged not fixed is never released and never re-checked", async () => {
  const init = base();
  init.claims.clm_3 = { campaign_id: "cam_0", status: "held", patched_url: "https://fix", fix_will_be: false };
  const { client, sent } = fakeChain(init);
  const e = env();
  for (let i = 0; i < 3; i++) await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.deepEqual(sent.map((s) => s.functionName), ["verify_fix"]);
});

test("a call that keeps reverting is counted and then skipped", async () => {
  const init = base();
  init.claims.clm_0 = { campaign_id: "cam_0", status: "open", patched_url: "" };
  const { client, sent } = fakeChain(init, { revert: { "run_review:clm_0": "source exceeds the reviewable size limit" } });
  const e = env({ MAX_FAILURES: "3" });
  for (let i = 0; i < 5; i++) await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.equal(sent.length, 3); // three attempts, then skipped
  const saved = JSON.parse(readFileSync(e.KEEPER_STATE, "utf8"));
  assert.equal(saved.failures["review:clm_0"], 3);
});

test("a dry run sends nothing but still leaves a state file", async () => {
  const init = base();
  init.claims.clm_0 = { campaign_id: "cam_0", status: "open", patched_url: "" };
  const { client, sent } = fakeChain(init);
  const e = env({ DRY_RUN: "1" });
  const r = await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.equal(sent.length, 0);
  assert.equal(r.actions.length, 1);
  assert.ok(existsSync(e.KEEPER_STATE));
});

test("a transient network error on send is retried, not counted as a revert", async () => {
  const init = base();
  init.claims.clm_0 = { campaign_id: "cam_0", status: "open", patched_url: "" };
  const { client, sent } = fakeChain(init, { transientWrites: 1 });
  const e = env();
  const r = await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
  assert.equal(sent.length, 1);
  assert.deepEqual(r.failures, {});
});

test("the run summary goes only where the passed env points", async () => {
  const init = base();
  init.claims.clm_0 = { campaign_id: "cam_0", status: "open", patched_url: "" };
  const { client } = fakeChain(init);
  const e = env({ DRY_RUN: "1" });
  const out = join(mkdtempSync(join(tmpdir(), "summary-")), "summary.md");
  const before = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = out; // a real run's summary file
  try {
    await runOnce({ client, account: ACCOUNT, addr: ADDR, env: e });
    assert.equal(existsSync(out), false); // the test env has no summary path
    await runOnce({ client, account: ACCOUNT, addr: ADDR, env: { ...e, GITHUB_STEP_SUMMARY: out } });
    assert.match(readFileSync(out, "utf8"), /Read 1 campaign\(s\) and 1 claim\(s\)/);
  } finally {
    if (before === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = before;
  }
});
