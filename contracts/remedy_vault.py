# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class RemedyVault(gl.Contract):
    # --- config ---
    owner: str
    fee_wallet: str
    protocol_fee_bps: u256

    # --- embedded settlement token (GenUSDC), whole units ---
    balances: TreeMap[str, u256]

    # --- campaigns ---
    campaign_ids: DynArray[str]
    campaign_counter: u256
    cam_project: TreeMap[str, str]
    cam_target_url: TreeMap[str, str]
    cam_pool: TreeMap[str, u256]
    cam_escrowed: TreeMap[str, u256]
    cam_paid_total: TreeMap[str, u256]
    cam_status: TreeMap[str, str]
    cam_pay_critical: TreeMap[str, u256]
    cam_pay_high: TreeMap[str, u256]
    cam_pay_medium: TreeMap[str, u256]
    cam_pay_low: TreeMap[str, u256]
    cam_is_critical_target: TreeMap[str, bool]
    cam_claim_count: TreeMap[str, u256]

    # --- claims, keyed by claim_id ---
    claim_ids: DynArray[str]
    claim_counter: u256
    cl_campaign: TreeMap[str, str]
    cl_seq: TreeMap[str, u256]
    cl_submitter: TreeMap[str, str]
    cl_submitted_at: TreeMap[str, str]
    cl_target_url: TreeMap[str, str]
    cl_poc_text: TreeMap[str, str]
    cl_patch_diff: TreeMap[str, str]
    cl_claimed_severity: TreeMap[str, str]
    cl_status: TreeMap[str, str]
    cl_outcome: TreeMap[str, str]
    cl_severity: TreeMap[str, str]
    cl_payout: TreeMap[str, u256]
    cl_escrowed: TreeMap[str, u256]
    cl_case_id: TreeMap[str, str]
    cl_reasoning: TreeMap[str, str]
    cl_minority_note: TreeMap[str, str]
    cl_merged_with: TreeMap[str, str]
    cl_attribution_bps: TreeMap[str, u256]

    def __init__(self, owner_address: str, fee_wallet_address: str, protocol_fee_bps: int):
        self.owner = owner_address.lower()
        self.fee_wallet = fee_wallet_address.lower()
        self.protocol_fee_bps = u256(protocol_fee_bps)
        self.campaign_counter = u256(0)
        self.claim_counter = u256(0)

    # ---------- token: open testnet faucet ----------
    @gl.public.write
    def mint(self, to_address: str, amount: int):
        to_address = to_address.lower()
        cur = self.balances[to_address] if to_address in self.balances else u256(0)
        self.balances[to_address] = u256(int(cur) + amount)

    @gl.public.view
    def balance_of(self, address: str) -> int:
        address = address.lower()
        return int(self.balances[address]) if address in self.balances else 0

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "owner": self.owner,
            "fee_wallet": self.fee_wallet,
            "protocol_fee_bps": int(self.protocol_fee_bps),
        }

    # ---------- campaign lifecycle ----------
    @gl.public.write
    def open_campaign(
        self,
        caller: str,
        target_url: str,
        pool_amount: int,
        pay_critical: int,
        pay_high: int,
        pay_medium: int,
        pay_low: int,
        is_critical_target: bool,
    ) -> str:
        project = caller.lower()
        amt = int(pool_amount)
        if amt <= 0:
            raise gl.UserError("pool must be positive")
        bal = int(self.balances[project]) if project in self.balances else 0
        if bal < amt:
            raise gl.UserError("insufficient GenUSDC balance for pool")

        campaign_id = "cam_" + str(int(self.campaign_counter))
        self.campaign_counter = u256(int(self.campaign_counter) + 1)
        self.campaign_ids.append(campaign_id)

        self.balances[project] = u256(bal - amt)
        self.cam_project[campaign_id] = project
        self.cam_target_url[campaign_id] = target_url
        self.cam_pool[campaign_id] = u256(amt)
        self.cam_escrowed[campaign_id] = u256(0)
        self.cam_paid_total[campaign_id] = u256(0)
        self.cam_status[campaign_id] = "active"
        self.cam_pay_critical[campaign_id] = u256(int(pay_critical))
        self.cam_pay_high[campaign_id] = u256(int(pay_high))
        self.cam_pay_medium[campaign_id] = u256(int(pay_medium))
        self.cam_pay_low[campaign_id] = u256(int(pay_low))
        self.cam_is_critical_target[campaign_id] = is_critical_target
        self.cam_claim_count[campaign_id] = u256(0)
        return campaign_id

    # ---------- claim submission (locked at intake) ----------
    @gl.public.write
    def submit_claim(
        self,
        caller: str,
        campaign_id: str,
        submitted_at: str,
        target_url: str,
        poc_text: str,
        patch_diff: str,
        claimed_severity: str,
    ) -> str:
        if campaign_id not in self.cam_status:
            raise gl.UserError("unknown campaign")
        if self.cam_status[campaign_id] != "active":
            raise gl.UserError("campaign not active")

        submitter = caller.lower()
        claim_id = "clm_" + str(int(self.claim_counter))
        self.claim_counter = u256(int(self.claim_counter) + 1)
        self.claim_ids.append(claim_id)

        seq = int(self.cam_claim_count[campaign_id])
        self.cam_claim_count[campaign_id] = u256(seq + 1)

        self.cl_campaign[claim_id] = campaign_id
        self.cl_seq[claim_id] = u256(seq)
        self.cl_submitter[claim_id] = submitter
        self.cl_submitted_at[claim_id] = submitted_at
        self.cl_target_url[claim_id] = target_url
        self.cl_poc_text[claim_id] = poc_text
        self.cl_patch_diff[claim_id] = patch_diff
        self.cl_claimed_severity[claim_id] = claimed_severity
        self.cl_status[claim_id] = "open"
        self.cl_outcome[claim_id] = ""
        self.cl_severity[claim_id] = ""
        self.cl_payout[claim_id] = u256(0)
        self.cl_escrowed[claim_id] = u256(0)
        self.cl_case_id[claim_id] = ""
        self.cl_reasoning[claim_id] = ""
        self.cl_minority_note[claim_id] = ""
        self.cl_merged_with[claim_id] = ""
        self.cl_attribution_bps[claim_id] = u256(0)
        return claim_id

    # ---------- priors reader (feeds the verifier's dedup step) ----------
    @gl.public.view
    def get_priors_json(self, campaign_id: str, exclude_claim_id: str) -> str:
        out = []
        for i in range(len(self.claim_ids)):
            cid = self.claim_ids[i]
            if self.cl_campaign[cid] != campaign_id:
                continue
            if cid == exclude_claim_id:
                continue
            st = self.cl_status[cid]
            if st != "open" and st != "rewarded" and st != "held":
                continue
            out.append({
                "claim_id": cid,
                "seq": int(self.cl_seq[cid]),
                "submitted_at": self.cl_submitted_at[cid],
                "poc_text": self.cl_poc_text[cid],
            })
        return json.dumps(out)

    # ---------- settlement relay: 4 single-claim outcomes ----------
    @gl.public.write
    def apply_outcome(
        self,
        caller: str,
        claim_id: str,
        outcome: str,
        severity: str,
        payout: int,
        case_id: str,
        reasoning: str,
        minority_note: str,
    ):
        if claim_id not in self.cl_status:
            raise gl.UserError("unknown claim")
        campaign_id = self.cl_campaign[claim_id]
        project = self.cam_project[campaign_id]
        if caller.lower() != self.owner and caller.lower() != project:
            raise gl.UserError("only owner or project can relay verdicts (V1 relay)")
        if self.cl_status[claim_id] != "open":
            raise gl.UserError("claim already resolved")
        if self.cam_status[campaign_id] == "paused":
            raise gl.UserError("campaign paused; no further settlement")

        submitter = self.cl_submitter[claim_id]
        pool = int(self.cam_pool[campaign_id])
        fee_bps = int(self.protocol_fee_bps)
        pay = int(payout)

        self.cl_severity[claim_id] = severity
        self.cl_case_id[claim_id] = case_id
        self.cl_reasoning[claim_id] = reasoning
        self.cl_minority_note[claim_id] = minority_note

        if outcome == "Reject":
            self.cl_outcome[claim_id] = "Reject"
            self.cl_status[claim_id] = "rejected"
            self.cl_payout[claim_id] = u256(0)
            return

        if outcome == "Escalate":
            self.cl_outcome[claim_id] = "Escalate"
            self.cl_status[claim_id] = "escalated"
            self.cam_status[campaign_id] = "paused"
            return

        if outcome == "Reward":
            if pay > pool:
                raise gl.UserError("payout exceeds remaining pool")
            fee = pay * fee_bps // 10000
            net = pay - fee
            sbal = int(self.balances[submitter]) if submitter in self.balances else 0
            self.balances[submitter] = u256(sbal + net)
            if fee > 0:
                fbal = int(self.balances[self.fee_wallet]) if self.fee_wallet in self.balances else 0
                self.balances[self.fee_wallet] = u256(fbal + fee)
            self.cam_pool[campaign_id] = u256(pool - pay)
            self.cam_paid_total[campaign_id] = u256(int(self.cam_paid_total[campaign_id]) + net)
            self.cl_outcome[claim_id] = "Reward"
            self.cl_status[claim_id] = "rewarded"
            self.cl_payout[claim_id] = u256(net)
            return

        if outcome == "HoldForPatch":
            if pay > pool:
                raise gl.UserError("escrow exceeds remaining pool")
            self.cam_pool[campaign_id] = u256(pool - pay)
            self.cam_escrowed[campaign_id] = u256(int(self.cam_escrowed[campaign_id]) + pay)
            self.cl_outcome[claim_id] = "HoldForPatch"
            self.cl_status[claim_id] = "held"
            self.cl_escrowed[claim_id] = u256(pay)
            return

        if outcome == "MergeDuplicate":
            raise gl.UserError("use apply_merge_duplicate for MergeDuplicate")

        raise gl.UserError("unknown outcome")

    # ---------- settlement relay: Merge-Duplicate (Balance proportional split) ----------
    @gl.public.write
    def apply_merge_duplicate(
        self,
        caller: str,
        duplicate_claim_id: str,
        original_claim_id: str,
        severity: str,
        total_payout: int,
        original_bps: int,
        duplicate_bps: int,
        case_id: str,
        reasoning: str,
        minority_note: str,
    ):
        if duplicate_claim_id not in self.cl_status:
            raise gl.UserError("unknown duplicate claim")
        if original_claim_id not in self.cl_status:
            raise gl.UserError("unknown original claim")
        if duplicate_claim_id == original_claim_id:
            raise gl.UserError("duplicate and original must differ")

        campaign_id = self.cl_campaign[duplicate_claim_id]
        if self.cl_campaign[original_claim_id] != campaign_id:
            raise gl.UserError("claims belong to different campaigns")

        project = self.cam_project[campaign_id]
        if caller.lower() != self.owner and caller.lower() != project:
            raise gl.UserError("only owner or project can relay verdicts (V1 relay)")
        if self.cam_status[campaign_id] == "paused":
            raise gl.UserError("campaign paused; no further settlement")
        if self.cl_status[duplicate_claim_id] != "open":
            raise gl.UserError("duplicate claim already resolved")

        o_bps = int(original_bps)
        d_bps = int(duplicate_bps)
        if o_bps + d_bps != 10000:
            raise gl.UserError("bps must sum to 10000")

        pool = int(self.cam_pool[campaign_id])
        total = int(total_payout)
        if total > pool:
            raise gl.UserError("total payout exceeds remaining pool")

        fee_bps = int(self.protocol_fee_bps)
        orig_gross = total * o_bps // 10000
        dup_gross = total - orig_gross
        orig_fee = orig_gross * fee_bps // 10000
        dup_fee = dup_gross * fee_bps // 10000
        orig_net = orig_gross - orig_fee
        dup_net = dup_gross - dup_fee
        total_fee = orig_fee + dup_fee

        orig_sub = self.cl_submitter[original_claim_id]
        dup_sub = self.cl_submitter[duplicate_claim_id]

        obal = int(self.balances[orig_sub]) if orig_sub in self.balances else 0
        self.balances[orig_sub] = u256(obal + orig_net)
        dbal = int(self.balances[dup_sub]) if dup_sub in self.balances else 0
        self.balances[dup_sub] = u256(dbal + dup_net)
        if total_fee > 0:
            fbal = int(self.balances[self.fee_wallet]) if self.fee_wallet in self.balances else 0
            self.balances[self.fee_wallet] = u256(fbal + total_fee)

        self.cam_pool[campaign_id] = u256(pool - total)
        self.cam_paid_total[campaign_id] = u256(int(self.cam_paid_total[campaign_id]) + orig_net + dup_net)

        # resolve the original claim (if still open) as the merged anchor
        if self.cl_status[original_claim_id] == "open":
            self.cl_outcome[original_claim_id] = "MergeDuplicate"
            self.cl_status[original_claim_id] = "rewarded"
            self.cl_severity[original_claim_id] = severity
            self.cl_payout[original_claim_id] = u256(orig_net)
            self.cl_case_id[original_claim_id] = case_id
            self.cl_merged_with[original_claim_id] = duplicate_claim_id
            self.cl_attribution_bps[original_claim_id] = u256(o_bps)

        # resolve the duplicate claim
        self.cl_outcome[duplicate_claim_id] = "MergeDuplicate"
        self.cl_status[duplicate_claim_id] = "rewarded"
        self.cl_severity[duplicate_claim_id] = severity
        self.cl_payout[duplicate_claim_id] = u256(dup_net)
        self.cl_case_id[duplicate_claim_id] = case_id
        self.cl_reasoning[duplicate_claim_id] = reasoning
        self.cl_minority_note[duplicate_claim_id] = minority_note
        self.cl_merged_with[duplicate_claim_id] = original_claim_id
        self.cl_attribution_bps[duplicate_claim_id] = u256(d_bps)

    # ---------- claim dismissal (owner / project / submitter; no payout) ----------
    @gl.public.write
    def dismiss_claim(self, caller: str, claim_id: str):
        if claim_id not in self.cl_status:
            raise gl.UserError("unknown claim")
        campaign_id = self.cl_campaign[claim_id]
        project = self.cam_project[campaign_id]
        submitter = self.cl_submitter[claim_id]
        c = caller.lower()
        if c != self.owner and c != project and c != submitter:
            raise gl.UserError("only owner, project, or the claim submitter can dismiss")
        if self.cl_status[claim_id] != "open":
            raise gl.UserError("only open claims can be dismissed")
        self.cl_outcome[claim_id] = "Dismissed"
        self.cl_status[claim_id] = "dismissed"
        self.cl_payout[claim_id] = u256(0)

    # ---------- views ----------
    @gl.public.view
    def get_campaign(self, campaign_id: str) -> dict:
        if campaign_id not in self.cam_status:
            return {}
        return {
            "campaign_id": campaign_id,
            "project": self.cam_project[campaign_id],
            "target_url": self.cam_target_url[campaign_id],
            "pool": int(self.cam_pool[campaign_id]),
            "escrowed": int(self.cam_escrowed[campaign_id]),
            "paid_total": int(self.cam_paid_total[campaign_id]),
            "status": self.cam_status[campaign_id],
            "pay_critical": int(self.cam_pay_critical[campaign_id]),
            "pay_high": int(self.cam_pay_high[campaign_id]),
            "pay_medium": int(self.cam_pay_medium[campaign_id]),
            "pay_low": int(self.cam_pay_low[campaign_id]),
            "is_critical_target": self.cam_is_critical_target[campaign_id],
            "claim_count": int(self.cam_claim_count[campaign_id]),
        }

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict:
        if claim_id not in self.cl_status:
            return {}
        return {
            "claim_id": claim_id,
            "campaign_id": self.cl_campaign[claim_id],
            "seq": int(self.cl_seq[claim_id]),
            "submitter": self.cl_submitter[claim_id],
            "submitted_at": self.cl_submitted_at[claim_id],
            "target_url": self.cl_target_url[claim_id],
            "poc_text": self.cl_poc_text[claim_id],
            "patch_diff": self.cl_patch_diff[claim_id],
            "claimed_severity": self.cl_claimed_severity[claim_id],
            "status": self.cl_status[claim_id],
            "outcome": self.cl_outcome[claim_id],
            "severity": self.cl_severity[claim_id],
            "payout": int(self.cl_payout[claim_id]),
            "escrowed": int(self.cl_escrowed[claim_id]),
            "case_id": self.cl_case_id[claim_id],
            "reasoning": self.cl_reasoning[claim_id],
            "minority_note": self.cl_minority_note[claim_id],
            "merged_with": self.cl_merged_with[claim_id],
            "attribution_bps": int(self.cl_attribution_bps[claim_id]),
        }

    @gl.public.view
    def get_campaign_count(self) -> int:
        return int(self.campaign_counter)

    @gl.public.view
    def get_all_campaign_ids(self) -> list:
        out = []
        for i in range(len(self.campaign_ids) - 1, -1, -1):
            out.append(self.campaign_ids[i])
        return out

    @gl.public.view
    def get_claims_for_campaign(self, campaign_id: str) -> list:
        out = []
        for i in range(len(self.claim_ids)):
            cid = self.claim_ids[i]
            if self.cl_campaign[cid] == campaign_id:
                out.append(cid)
        return out
