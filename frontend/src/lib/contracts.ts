import { readContract, writeContractChecked } from "./genlayer";

// --- deployed Remedy contracts (GenLayer Studio, chainId 61999) ---
// v2 TRUSTLESS: vault reads verdicts directly from the verifier; settlement
// is permissionless (no owner relay).
// V4 (per-target payout tiers, second cited target, keeper-driven settlement): fresh verifier + vault pair, set_vault wired.
export const VAULT_ADDRESS = "0x999021cADC09505E68a9e75229e0a9048212e227";
export const VERIFIER_ADDRESS = "0xc44E0461d6C1DCbC8F9A7F3A684c36E076c09801";

// ---------- token ----------
export async function mint(toAddress: string, amount: number) {
  return writeContractChecked(VAULT_ADDRESS, "mint", [toAddress, amount]);
}

export async function faucet() {
  return writeContractChecked(VAULT_ADDRESS, "faucet", []);
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
  targetUrls: string[],
  poolAmount: number,
  payCritical: number,
  payHigh: number,
  payMedium: number,
  payLow: number,
  isCriticalTarget: boolean,
  bondAmount: number,
  // V4: one [critical, high, medium, low] schedule per target, or [] to use the
  // campaign schedule for every target. Fixed at opening.
  targetTiers: number[][]
) {
  return writeContractChecked(VAULT_ADDRESS, "open_campaign", [
    targetUrls,
    poolAmount,
    payCritical,
    payHigh,
    payMedium,
    payLow,
    isCriticalTarget,
    bondAmount,
    targetTiers,
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
  targetIndex: number,
  pocText: string,
  patchDiff: string,
  claimedSeverity: string,
  // V4: an optional second cited target, or -1 for none
  secondTargetIndex: number
) {
  return writeContractChecked(VAULT_ADDRESS, "submit_claim", [
    campaignId,
    submittedAt,
    targetIndex,
    pocText,
    patchDiff,
    claimedSeverity,
    secondTargetIndex,
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
  return writeContractChecked(VAULT_ADDRESS, "dismiss_claim", [claimId]);
}

// ---------- verifier ----------
export async function runReview(claimId: string) {
  return writeContractChecked(VERIFIER_ADDRESS, "run_review", [claimId]);
}

export async function getVerdict(caseId: string): Promise<any> {
  return await readContract(VERIFIER_ADDRESS, "get_verdict", [caseId]);
}

export async function getAllVerifierCaseIds(): Promise<string[]> {
  return (await readContract(VERIFIER_ADDRESS, "get_all_case_ids", [])) as string[];
}

// ---------- TRUSTLESS settlement (permissionless; vault reads verifier) ----------
export async function settleClaim(claimId: string) {
  return writeContractChecked(VAULT_ADDRESS, "settle_claim", [claimId]);
}

export async function submitFix(claimId: string, patchedUrl: string) {
  return writeContractChecked(VAULT_ADDRESS, "submit_fix", [claimId, patchedUrl]);
}

export async function verifyFix(claimId: string) {
  return writeContractChecked(VERIFIER_ADDRESS, "verify_fix", [claimId]);
}

export async function releaseEscrow(claimId: string) {
  return writeContractChecked(VAULT_ADDRESS, "release_escrow", [claimId]);
}

export async function refundEscrow(claimId: string) {
  return writeContractChecked(VAULT_ADDRESS, "refund_escrow", [claimId]);
}

export async function resumeCampaign(campaignId: string) {
  return writeContractChecked(VAULT_ADDRESS, "resume_campaign", [campaignId]);
}

export async function getFixResult(claimId: string, patchedUrl: string): Promise<any> {
  return await readContract(VERIFIER_ADDRESS, "get_fix_result", [claimId, patchedUrl]);
}

export async function getCaseForClaim(claimId: string): Promise<string> {
  return (await readContract(VERIFIER_ADDRESS, "get_case_for_claim", [claimId])) as string;
}

export async function getReputation(address: string): Promise<any> {
  return await readContract(VAULT_ADDRESS, "get_reputation", [address]);
}
