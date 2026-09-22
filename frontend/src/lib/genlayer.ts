import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const REMEDY_CHAIN = studionet;
export const CHAIN_ID = 61999 as const;

export function normAddr(a: string): string {
  return a.toLowerCase();
}

type Mode = "metamask" | "demo";
let mode: Mode = "demo";
let mmAddress: string | null = null;
let mmProvider: any = null;
let burnerAccount: any = null;

export function setWalletProvider(p: any) {
  mmProvider = p;
}

function getBurner() {
  if (!burnerAccount) {
    let pk = localStorage.getItem("remedy_burner_pk");
    if (!pk) {
      pk = generatePrivateKey();
      localStorage.setItem("remedy_burner_pk", pk);
    }
    burnerAccount = createAccount(pk as `0x${string}`);
  }
  return burnerAccount;
}

export function resetBurner() {
  burnerAccount = null;
  try {
    localStorage.removeItem("remedy_burner_pk");
  } catch {
    /* ignore */
  }
}

export function activateDemo(): string {
  mode = "demo";
  return (getBurner().address as string).toLowerCase();
}

export function activateMetaMask(address: string) {
  mode = "metamask";
  mmAddress = address.toLowerCase();
}

export function currentMode(): Mode {
  return mode;
}

function applyProvider() {
  if (mmProvider) {
    try {
      (window as any).ethereum = mmProvider;
    } catch {
      /* provider not reassignable */
    }
  }
}

function getReadClient() {
  return createClient({ chain: studionet }) as any;
}

async function getWriteClient() {
  if (mode === "demo") {
    return createClient({ chain: studionet, account: getBurner() }) as any;
  }
  applyProvider();
  const client = createClient({ chain: studionet, account: mmAddress as `0x${string}` }) as any;
  await client.connect("studionet");
  return client;
}

function isBusy(e: any): boolean {
  const m = String((e && e.message) || e).toLowerCase();
  return m.includes("busy") || m.includes("slots") || m.includes("retry") || m.includes("not supported");
}

function isNetwork(e: any): boolean {
  const m = String((e && e.message) || e).toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("load failed") ||
    m.includes("connection")
  );
}

export async function readContract(address: string, functionName: string, args: unknown[] = []) {
  const client = getReadClient();
  let lastErr: any;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await client.readContract({ address, functionName, args });
    } catch (e: any) {
      lastErr = e;
      // Retry transient node conditions AND network blips (reads are idempotent).
      if (isBusy(e) || isNetwork(e)) {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  // Exhausted retries: give a calm, accurate message for a network outage.
  if (isNetwork(lastErr)) {
    throw new Error(
      "Can't reach the GenLayer Studio network right now. It may be briefly unavailable. Wait a moment and hit Refresh."
    );
  }
  throw lastErr;
}

export async function writeContract(address: string, functionName: string, args: unknown[] = [], waitRetries = 30) {
  const client = await getWriteClient();
  let hash: string | null = null;
  let lastErr: any;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      hash = await client.writeContract({ address, functionName, args, value: BigInt(0) });
      break;
    } catch (e: any) {
      lastErr = e;
      if (isBusy(e)) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  if (!hash) throw lastErr;
  await client.waitForTransactionReceipt({ hash: hash as any, status: "ACCEPTED", interval: 4000, retries: waitRetries });
  return hash as string;
}

function decodeRevertResult(result: any): string | null {
  if (typeof result !== "string") return null;
  try {
    const decoded = atob(result);
    if (decoded.charCodeAt(0) === 1) {
      return decoded.slice(1);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function writeContractChecked(address: string, functionName: string, args: unknown[] = [], waitRetries = 30) {
  const client = await getWriteClient();
  let hash: string | null = null;
  let lastErr: any;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      hash = await client.writeContract({ address, functionName, args, value: BigInt(0) });
      break;
    } catch (e: any) {
      lastErr = e;
      if (isBusy(e)) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  if (!hash) throw lastErr;
  const receipt = await client.waitForTransactionReceipt({ hash: hash as any, status: "ACCEPTED", interval: 4000, retries: waitRetries });
  const leader = (receipt as any)?.consensus_data?.leader_receipt?.[0];
  const status = leader?.execution_result;
  if (status && status !== "SUCCESS") {
    console.log("[remedy] reverted receipt", JSON.stringify(leader, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
    // Prefer the contract's own UserError message; otherwise the LAST line of
    // stderr, which is where a Python traceback names the actual error.
    const stderr: string = typeof leader?.genvm_result?.stderr === "string" ? leader.genvm_result.stderr : "";
    const lastStderrLine = stderr.split("\n").map((l) => l.trim()).filter((l) => l !== "").pop() || "";
    let reason: string =
      decodeRevertResult(leader?.result) ||
      lastStderrLine ||
      (typeof leader?.error === "string" ? leader.error : "") ||
      (typeof leader?.genvm_result?.error === "string" ? leader.genvm_result.error : "") ||
      "the transaction reverted (see browser console for the full receipt)";
    reason = reason.trim();
    // keep the tail: the end of a long error is where the cause is
    if (reason.length > 300) reason = "..." + reason.slice(-300);
    const err = new Error(reason);
    (err as any).reverted = true;
    throw err;
  }
  return hash as string;
}
