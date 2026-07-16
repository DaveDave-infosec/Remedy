import { readContract, writeContract } from "./genlayer";

// --- deployed Remedy contracts (GenLayer Studio, chainId 61999) ---
// v2 TRUSTLESS: vault reads verdicts directly from the verifier; settlement
// is permissionless (no owner relay).
export const VAULT_ADDRESS = "0xF636CB3967DD998FF5f1Bd3ab3900933bF54AdC4";
export const VERIFIER_ADDRESS = "0x94e4535133e71d82C15A811070B34Cd72C505a97";

// ---------- token ----------
export async function mint(toAddress: string, amount: number) {
  return writeContract(VAULT_ADDRESS, "mint", [toAddress, amount]);
}

export async function faucet() {
  return writeContract(VAULT_ADDRESS, "faucet", []);
}

export async function hasClaimedFaucet(address: string): Promise<boolean> {
  return (await readContract(VAULT_ADDRESS, "has_claimed_faucet", [address])) as boolean;
}

export async function balanceOf(address: string): Promise<number> {
  return Number(await readContract(VAULT_ADDRESS, "balance_of", [address]));
}

export async function getConfig(): Promise<any> {
  return await readContract(VAULT_ADDRESS, "get_config", []);
}

// ---------- campaigns ----------
export async function openCampaign(
  targetUrl: string,
  poolAmount: number,
  payCritical: number,
  payHigh: number,
  payMedium: number,
  payLow: number,
  isCriticalTarget: boolean
) {
  return writeContract(VAULT_ADDRESS, "open_campaign", [
    targetUrl,
    poolAmount,
    payCritical,
    payHigh,
    payMedium,
    payLow,
    isCriticalTarget,
  ]);
}

export async function getCampaign(campaignId: string): Promise<any> {
  return await readContract(VAULT_ADDRESS, "get_campaign", [campaignId]);
}

export async function getAllCampaignIds(): Promise<string[]> {
  return (await readContract(VAULT_ADDRESS, "get_all_campaign_ids", [])) as string[];
}

export async function getCampaignCount(): Promise<number> {
  return Number(await readContract(VAULT_ADDRESS, "get_campaign_count", []));
}

// ---------- claims ----------
export async function submitClaim(
  campaignId: string,
  submittedAt: string,
  targetUrl: string,
  pocText: string,
  patchDiff: string,
  claimedSeverity: string
) {
  return writeContract(VAULT_ADDRESS, "submit_claim", [
    campaignId,
    submittedAt,
    targetUrl,
    pocText,
    patchDiff,
    claimedSeverity,
  ]);
}

export async function getClaim(claimId: string): Promise<any> {
  return await readContract(VAULT_ADDRESS, "get_claim", [claimId]);
}

export async function getClaimsForCampaign(campaignId: string): Promise<string[]> {
  return (await readContract(VAULT_ADDRESS, "get_claims_for_campaign", [campaignId])) as string[];
}

export async function getPriorsJson(campaignId: string, excludeClaimId: string): Promise<string> {
  return (await readContract(VAULT_ADDRESS, "get_priors_json", [campaignId, excludeClaimId])) as string;
}

export async function dismissClaim(claimId: string) {
  return writeContract(VAULT_ADDRESS, "dismiss_claim", [claimId]);
}

// ---------- verifier ----------
export async function runReview(
  claimId: string,
  targetUrl: string,
  pocText: string,
  patchDiff: string,
  claimedSeverity: string,
  sevCritical: number,
  sevHigh: number,
  sevMedium: number,
  sevLow: number,
  isCriticalTarget: boolean,
  priorClaimsJson: string
) {
  return writeContract(VERIFIER_ADDRESS, "run_review", [
    claimId,
    targetUrl,
    pocText,
    patchDiff,
    claimedSeverity,
    sevCritical,
    sevHigh,
    sevMedium,
    sevLow,
    isCriticalTarget,
    priorClaimsJson,
  ]);
}

export async function getVerdict(caseId: string): Promise<any> {
  return await readContract(VERIFIER_ADDRESS, "get_verdict", [caseId]);
}

export async function getAllVerifierCaseIds(): Promise<string[]> {
  return (await readContract(VERIFIER_ADDRESS, "get_all_case_ids", [])) as string[];
}

// ---------- TRUSTLESS settlement (permissionless; vault reads verifier) ----------
export async function settleClaim(claimId: string, caseId: string) {
  return writeContract(VAULT_ADDRESS, "settle_claim", [claimId, caseId]);
}
