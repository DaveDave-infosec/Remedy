import { readContract, writeContract } from "./genlayer";

// --- deployed Remedy contracts (GenLayer Studio, chainId 61999) ---
export const VAULT_ADDRESS = "0x809Ae569711DA76dCe392371aC5dFAE073e2966F";
export const VERIFIER_ADDRESS = "0x82eeCb3Db92A01155DAddE39d47E20A7652BAb74";

// ---------- token ----------
export async function mint(toAddress: string, amount: number) {
  return writeContract(VAULT_ADDRESS, "mint", [toAddress, amount]);
}

export async function balanceOf(address: string): Promise<number> {
  return Number(await readContract(VAULT_ADDRESS, "balance_of", [address]));
}

export async function getConfig(): Promise<any> {
  return await readContract(VAULT_ADDRESS, "get_config", []);
}

// ---------- campaigns ----------
export async function openCampaign(
  caller: string,
  targetUrl: string,
  poolAmount: number,
  payCritical: number,
  payHigh: number,
  payMedium: number,
  payLow: number,
  isCriticalTarget: boolean
) {
  return writeContract(VAULT_ADDRESS, "open_campaign", [
    caller,
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
  caller: string,
  campaignId: string,
  submittedAt: string,
  targetUrl: string,
  pocText: string,
  patchDiff: string,
  claimedSeverity: string
) {
  return writeContract(VAULT_ADDRESS, "submit_claim", [
    caller,
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

// ---------- verifier ----------
export async function runReview(
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

// ---------- settlement relay ----------
export async function applyOutcome(
  caller: string,
  claimId: string,
  outcome: string,
  severity: string,
  payout: number,
  caseId: string,
  reasoning: string,
  minorityNote: string
) {
  return writeContract(VAULT_ADDRESS, "apply_outcome", [
    caller,
    claimId,
    outcome,
    severity,
    payout,
    caseId,
    reasoning,
    minorityNote,
  ]);
}

export async function getAllVerifierCaseIds(): Promise<string[]> {
  return (await readContract(VERIFIER_ADDRESS, "get_all_case_ids", [])) as string[];
}

export async function dismissClaim(caller: string, claimId: string) {
  return writeContract(VAULT_ADDRESS, "dismiss_claim", [caller, claimId]);
}

export async function applyMergeDuplicate(
  caller: string,
  duplicateClaimId: string,
  originalClaimId: string,
  severity: string,
  totalPayout: number,
  originalBps: number,
  duplicateBps: number,
  caseId: string,
  reasoning: string,
  minorityNote: string
) {
  return writeContract(VAULT_ADDRESS, "apply_merge_duplicate", [
    caller,
    duplicateClaimId,
    originalClaimId,
    severity,
    totalPayout,
    originalBps,
    duplicateBps,
    caseId,
    reasoning,
    minorityNote,
  ]);
}
