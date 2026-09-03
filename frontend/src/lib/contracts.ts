import { readContract, writeContract } from "./genlayer";

// --- deployed Remedy contracts (GenLayer Studio, chainId 61999) ---
// v2 TRUSTLESS: vault reads verdicts directly from the verifier; settlement
// is permissionless (no owner relay).
export const VAULT_ADDRESS = "0xd85CEA29Bc1406d969E574A9023e1e59EeE5f957";
export const VERIFIER_ADDRESS = "0x814215e14048f9efeb9B7D0a550Ba587B59e603A";

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
export async function runReview(claimId: string) {
  return writeContract(VERIFIER_ADDRESS, "run_review", [claimId]);
}

export async function getVerdict(caseId: string): Promise<any> {
  return await readContract(VERIFIER_ADDRESS, "get_verdict", [caseId]);
}

export async function getAllVerifierCaseIds(): Promise<string[]> {
  return (await readContract(VERIFIER_ADDRESS, "get_all_case_ids", [])) as string[];
}

// ---------- TRUSTLESS settlement (permissionless; vault reads verifier) ----------
export async function settleClaim(claimId: string) {
  return writeContract(VAULT_ADDRESS, "settle_claim", [claimId]);
}

export async function submitFix(claimId: string, patchedUrl: string) {
  return writeContract(VAULT_ADDRESS, "submit_fix", [claimId, patchedUrl]);
}

export async function verifyFix(claimId: string) {
  return writeContract(VERIFIER_ADDRESS, "verify_fix", [claimId]);
}

export async function releaseEscrow(claimId: string) {
  return writeContract(VAULT_ADDRESS, "release_escrow", [claimId]);
}

export async function refundEscrow(claimId: string) {
  return writeContract(VAULT_ADDRESS, "refund_escrow", [claimId]);
}

export async function resumeCampaign(campaignId: string) {
  return writeContract(VAULT_ADDRESS, "resume_campaign", [campaignId]);
}

export async function getFixResult(patchedUrl: string): Promise<any> {
  return await readContract(VERIFIER_ADDRESS, "get_fix_result", [patchedUrl]);
}

export async function getCaseForClaim(claimId: string): Promise<string> {
  return (await readContract(VERIFIER_ADDRESS, "get_case_for_claim", [claimId])) as string;
}
