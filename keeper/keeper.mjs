// Remedy keeper: reads the live contracts, plans, and executes.
//
// Runs on a schedule in GitHub Actions (.github/workflows/keeper.yml). Every
// call it makes is permissionless and the contracts decide every outcome and
// amount, so the keeper needs no privileges and no funded wallet: by default it
// signs with a fresh throwaway key on each run. Set KEEPER_PRIVATE_KEY only if
// you want a stable keeper address.
//
// Environment:
//   DRY_RUN=1            plan and print, send nothing
//   MAX_WRITES=6         writes per run
//   MAX_SLOW=3           consensus-heavy writes (reviews, fix checks) per run
//   MAX_FAILURES=3       skip an action after this many reverts
//   KEEPER_STATE=path    where revert counts persist between runs
//   KEEPER_PRIVATE_KEY   optional stable signing key

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { planActions, failureKey } from "./plan.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// The app's contracts.ts is the single source of truth for the live addresses,
// so a redeploy only ever changes one file.
function liveAddresses() {
  const src = readFileSync(join(here, "..", "frontend", "src", "lib", "contracts.ts"), "utf8");
  const vault = /VAULT_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/.exec(src);
  const verifier = /VERIFIER_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/.exec(src);
  if (!vault || !verifier) throw new Error("could not read contract addresses from contracts.ts");
  return { vault: vault[1], verifier: verifier[1] };
}

const get = (o, k) => (o instanceof Map ? o.get(k) : o?.[k]);

function num(env, name, fallback) {
  const v = Number(env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}


function loadFailures(STATE_PATH) {
  try {
    return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")).failures ?? {} : {};
  } catch {
    return {};
  }
}

function saveFailures(STATE_PATH, failures) {
  writeFileSync(STATE_PATH, JSON.stringify({ failures, updated: new Date().toISOString() }, null, 2));
}

function isTransient(e) {
  const m = String(e?.message ?? e).toLowerCase();
  return ["busy", "slots", "retry", "fetch", "network", "timeout", "timed out", "econnreset", "socket"].some((s) => m.includes(s));
}

async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

function decodeRevert(result) {
  if (typeof result !== "string") return null;
  try {
    const s = Buffer.from(result, "base64").toString("latin1");
    return s.charCodeAt(0) === 1 ? s.slice(1) : null;
  } catch {
    return null;
  }
}

export async function readState(client, addr) {
  const read = (address, functionName, args = []) => withRetry(() => client.readContract({ address, functionName, args }));
  const campaigns = [];
  const claims = [];
  for (const cid of (await read(addr.vault, "get_all_campaign_ids")) ?? []) {
    const cam = await read(addr.vault, "get_campaign", [cid]);
    campaigns.push({ campaign_id: cid, status: get(cam, "status") });
    for (const id of (await read(addr.vault, "get_claims_for_campaign", [cid])) ?? []) {
      const cl = await read(addr.vault, "get_claim", [id]);
      const status = get(cl, "status");
      const row = { claim_id: id, campaign_id: cid, status, case_id: "", patched_url: get(cl, "patched_url") ?? "", fix: { checked: false, fixed: false } };
      if (status === "open") row.case_id = (await read(addr.verifier, "get_case_for_claim", [id])) ?? "";
      if (status === "held" && row.patched_url) {
        const f = await read(addr.verifier, "get_fix_result", [id, row.patched_url]);
        row.fix = { checked: Boolean(get(f, "checked")), fixed: Boolean(get(f, "fixed")) };
      }
      claims.push(row);
    }
  }
  return { campaigns, claims };
}

export async function execute(client, address, method, claimId, waitRetries = 60) {
  const hash = await withRetry(() => client.writeContract({ address, functionName: method, args: [claimId], value: 0n }), 4);
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", interval: 5000, retries: waitRetries });
  } catch (e) {
    // consensus can outlast the wait; the next run reads the result from the chain
    return { hash, outcome: "pending", detail: "not accepted within the wait window" };
  }
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  const status = leader?.execution_result;
  if (status && status !== "SUCCESS") {
    const stderr = typeof leader?.genvm_result?.stderr === "string" ? leader.genvm_result.stderr : "";
    const last = stderr.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "";
    return { hash, outcome: "reverted", detail: (decodeRevert(leader?.result) || last || "reverted").slice(-240) };
  }
  return { hash, outcome: "ok", detail: "" };
}

// Only the env passed to runOnce decides where the summary goes, so the test
// suite (which passes its own env) never writes into a real run's summary.
function summarize(env, lines) {
  const out = env.GITHUB_STEP_SUMMARY;
  if (out) appendFileSync(out, lines.join("\n") + "\n");
}

export async function runOnce({ client, account, addr, env = process.env }) {
  const DRY = env.DRY_RUN === "1";
  const STATE_PATH = env.KEEPER_STATE || join(here, ".keeper-state.json");

  const state = await readState(client, addr);
  const failures = loadFailures(STATE_PATH);
  const { actions, skipped } = planActions(state, {
    maxWrites: num(env, "MAX_WRITES", 6),
    maxSlow: num(env, "MAX_SLOW", 3),
    maxFailures: num(env, "MAX_FAILURES", 3),
    failures,
  });

  console.log(`keeper ${account.address} | vault ${addr.vault} | verifier ${addr.verifier}`);
  console.log(`read ${state.campaigns.length} campaign(s), ${state.claims.length} claim(s); planned ${actions.length}, skipped ${skipped.length}${DRY ? " (dry run)" : ""}`);
  for (const s of skipped) console.log(`  skip ${s.kind} ${s.claim_id}: ${s.reason}`);

  const md = [
    "## Remedy keeper run",
    "",
    `Vault \`${addr.vault}\` · Verifier \`${addr.verifier}\` · keeper \`${account.address}\`${DRY ? " · **dry run**" : ""}`,
    "",
    `Read ${state.campaigns.length} campaign(s) and ${state.claims.length} claim(s).`,
    "",
    "| action | claim | outcome | tx | detail |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const a of actions) {
    const address = a.contract === "vault" ? addr.vault : addr.verifier;
    if (DRY) {
      console.log(`  would ${a.method}(${a.claim_id})`);
      md.push(`| ${a.method} | ${a.claim_id} | planned | | |`);
      continue;
    }
    let res;
    try {
      res = await execute(client, address, a.method, a.claim_id, num(env, "WAIT_RETRIES", 60));
    } catch (e) {
      res = { hash: "", outcome: "error", detail: String(e?.message ?? e).slice(0, 240) };
    }
    const key = failureKey(a.kind, a.claim_id);
    if (res.outcome === "reverted") failures[key] = (failures[key] ?? 0) + 1;
    if (res.outcome === "ok") delete failures[key];
    console.log(`  ${a.method}(${a.claim_id}) -> ${res.outcome} ${res.hash} ${res.detail}`);
    const tx = res.hash ? `[${res.hash.slice(0, 10)}...](https://explorer-studio.genlayer.com/tx/${res.hash})` : "";
    md.push(`| ${a.method} | ${a.claim_id} | ${res.outcome} | ${tx} | ${res.detail.replace(/\|/g, "/")} |`);
  }
  if (actions.length === 0) md.push("| none | | nothing to do | | |");
  for (const s of skipped) md.push(`| ${s.kind} | ${s.claim_id} | skipped | | ${s.reason} |`);

  // dry runs never change the counts, but the file must exist for the cache step
  saveFailures(STATE_PATH, failures);
  summarize(env, md);
  return { state, actions, skipped, failures };
}

async function main() {
  const addr = liveAddresses();
  const account = createAccount(process.env.KEEPER_PRIVATE_KEY || generatePrivateKey());
  const client = createClient({ chain: studionet, account });
  await runOnce({ client, account, addr });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("keeper failed:", e?.stack ?? e);
    process.exit(1);
  });
}
