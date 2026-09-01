# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


# V2: a campaign target must be a COMMIT-PINNED raw GitHub URL, so the reviewed
# source cannot change under a claim. Held escrow cannot be reclaimed at will:
# a failed fix must be proven by the verifier AND a grace window must elapse.
REFUND_GRACE_SECONDS = 604800
PIN_PREFIX = "https://raw.githubusercontent.com/"
HEX_CHARS = "0123456789abcdef"


class RemedyVault(gl.Contract):
    # --- config ---
    # owner exists ONLY to gate the testnet faucet (mint). It has NO power over
    # settlement: settle_claim is permissionless and reads verdicts from the
    # verifier. In production the faucet would not exist at all.
    owner: str
    fee_wallet: str
    protocol_fee_bps: u256
    verifier: Address

    # --- embedded settlement token (GenUSDC), whole units ---
    balances: TreeMap[str, u256]
    faucet_claimed: TreeMap[str, bool]

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
    cl_held_at: TreeMap[str, str]

    def __init__(self, owner_address: str, fee_wallet_address: str, protocol_fee_bps: int, verifier_address: str):
        self.owner = owner_address.lower()
        self.fee_wallet = fee_wallet_address.lower()
        self.protocol_fee_bps = u256(protocol_fee_bps)
        self.verifier = Address(verifier_address)
        self.campaign_counter = u256(0)
        self.claim_counter = u256(0)

    # ---------- token: OWNER-GATED testnet faucet ----------
    @gl.public.write
    def mint(self, to_address: str, amount: int):
        sender = gl.message.sender_address.as_hex.lower()
        if sender != self.owner:
            raise gl.vm.UserError("only owner may mint testnet tokens")
        to_address = to_address.lower()
        cur = self.balances[to_address] if to_address in self.balances else u256(0)
        self.balances[to_address] = u256(int(cur) + amount)

    # ---------- public capped faucet: anyone, once, fixed grant ----------
    @gl.public.write
    def faucet(self):
        sender = gl.message.sender_address.as_hex.lower()
        if sender in self.faucet_claimed and self.faucet_claimed[sender]:
            raise gl.vm.UserError("faucet already claimed for this address")
        self.faucet_claimed[sender] = True
        cur = self.balances[sender] if sender in self.balances else u256(0)
        self.balances[sender] = u256(int(cur) + 50000)

    @gl.public.view
    def has_claimed_faucet(self, address: str) -> bool:
        a = address.lower()
        return a in self.faucet_claimed and self.faucet_claimed[a]

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
            "verifier": self.verifier.as_hex,
        }

    # ---------- campaign lifecycle (permissionless; real sender is the project) ----------
    @gl.public.write
    def open_campaign(
        self,
        target_url: str,
        pool_amount: int,
        pay_critical: int,
        pay_high: int,
        pay_medium: int,
        pay_low: int,
        is_critical_target: bool,
    ) -> str:
        project = gl.message.sender_address.as_hex.lower()
        if not self._is_commit_pinned(target_url):
            raise gl.vm.UserError(
                "target must be a commit-pinned raw GitHub URL of the form "
                "https://raw.githubusercontent.com/<owner>/<repo>/<40-character "
                "commit sha>/<path>; a branch URL can change after a claim is filed"
            )
        amt = int(pool_amount)
        if amt <= 0:
            raise gl.vm.UserError("pool must be positive")
        bal = int(self.balances[project]) if project in self.balances else 0
        if bal < amt:
            raise gl.vm.UserError("insufficient GenUSDC balance for pool")

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

    # ---------- claim submission (real sender is the submitter; locked at intake) ----------
    @gl.public.write
    def submit_claim(
        self,
        campaign_id: str,
        submitted_at: str,
        target_url: str,
        poc_text: str,
        patch_diff: str,
        claimed_severity: str,
    ) -> str:
        if campaign_id not in self.cam_status:
            raise gl.vm.UserError("unknown campaign")
        if self.cam_status[campaign_id] != "active":
            raise gl.vm.UserError("campaign not active")

        submitter = gl.message.sender_address.as_hex.lower()
        claim_id = "clm_" + str(int(self.claim_counter))
        self.claim_counter = u256(int(self.claim_counter) + 1)
        self.claim_ids.append(claim_id)

        seq = int(self.cam_claim_count[campaign_id])
        self.cam_claim_count[campaign_id] = u256(seq + 1)

        self.cl_campaign[claim_id] = campaign_id
        self.cl_seq[claim_id] = u256(seq)
        self.cl_submitter[claim_id] = submitter
        self.cl_submitted_at[claim_id] = submitted_at
        # target is fixed by the campaign; the claim inherits the campaign's locked target
        self.cl_target_url[claim_id] = self.cam_target_url[campaign_id]
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

    # ---------- helpers ----------
    def _find_claim_by_seq(self, campaign_id: str, seq: int) -> str:
        for i in range(len(self.claim_ids)):
            cid = self.claim_ids[i]
            if self.cl_campaign[cid] == campaign_id and int(self.cl_seq[cid]) == seq:
                return cid
        return ""

    def _payout_for(self, campaign_id: str, severity: str) -> int:
        if severity == "Critical":
            return int(self.cam_pay_critical[campaign_id])
        if severity == "High":
            return int(self.cam_pay_high[campaign_id])
        if severity == "Medium":
            return int(self.cam_pay_medium[campaign_id])
        if severity == "Low":
            return int(self.cam_pay_low[campaign_id])
        return 0

    def _is_hex40(self, s: str) -> bool:
        if len(s) != 40:
            return False
        low = s.lower()
        for ch in low:
            if ch not in HEX_CHARS:
                return False
        return True

    def _is_commit_pinned(self, url: str) -> bool:
        # https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-commit>/<path>
        if not url.startswith(PIN_PREFIX):
            return False
        rest = url[len(PIN_PREFIX):]
        parts = rest.split("/")
        if len(parts) < 4:
            return False
        if parts[0] == "" or parts[1] == "":
            return False
        path = "/".join(parts[3:])
        if path == "":
            return False
        return self._is_hex40(parts[2])

    def _days_from_civil(self, y: int, m: int, d: int) -> int:
        if m <= 2:
            y = y - 1
        era = (y if y >= 0 else y - 399) // 400
        yoe = y - era * 400
        mp = m + (-3 if m > 2 else 9)
        doy = (153 * mp + 2) // 5 + d - 1
        doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
        return era * 146097 + doe - 719468

    def _iso_to_epoch(self, s: str) -> int:
        # message-envelope time: every validator reads the SAME value for a tx
        y = int(s[0:4])
        mo = int(s[5:7])
        d = int(s[8:10])
        h = int(s[11:13])
        mi = int(s[14:16])
        se = int(s[17:19])
        return self._days_from_civil(y, mo, d) * 86400 + h * 3600 + mi * 60 + se

    # ---------- TRUSTLESS SETTLEMENT (permissionless; canonical verdict from verifier) ----------
    @gl.public.write
    def settle_claim(self, claim_id: str) -> str:
        if claim_id not in self.cl_status:
            raise gl.vm.UserError("unknown claim")
        if self.cl_status[claim_id] != "open":
            raise gl.vm.UserError("claim already resolved")
        campaign_id = self.cl_campaign[claim_id]
        if self.cam_status[campaign_id] == "paused":
            raise gl.vm.UserError("campaign paused; no further settlement")

        # derive the ONE authorized verdict for this claim from the verifier
        vf = gl.get_contract_at(self.verifier)
        case_id = str(vf.view().get_case_for_claim(claim_id))
        if case_id == "":
            raise gl.vm.UserError("no verdict for this claim yet")
        v = vf.view().get_verdict(case_id)
        if not v or "outcome" not in v:
            raise gl.vm.UserError("verdict not found on verifier")

        # bind the verdict to THIS claim and its locked target
        if str(v["claim_id"]) != claim_id:
            raise gl.vm.UserError("verdict is for a different claim")
        if str(v["target_url"]) != self.cl_target_url[claim_id]:
            raise gl.vm.UserError("verdict target does not match claim target")

        outcome = str(v["outcome"])
        severity = str(v["severity"])
        reasoning = str(v["reasoning"])
        minority_note = str(v["minority_note"])

        self.cl_severity[claim_id] = severity
        self.cl_case_id[claim_id] = case_id
        self.cl_reasoning[claim_id] = reasoning
        self.cl_minority_note[claim_id] = minority_note

        pool = int(self.cam_pool[campaign_id])
        fee_bps = int(self.protocol_fee_bps)

        # AUTHORITATIVE payout: recomputed from this campaign's own on-chain schedule
        # for the severity consensus assigned. The verifier's payout number is never trusted.
        payout = self._payout_for(campaign_id, severity)

        if outcome == "Reject":
            self.cl_outcome[claim_id] = "Reject"
            self.cl_status[claim_id] = "rejected"
            self.cl_payout[claim_id] = u256(0)
            return "Reject"

        if outcome == "Escalate":
            self.cl_outcome[claim_id] = "Escalate"
            self.cl_status[claim_id] = "escalated"
            self.cam_status[campaign_id] = "paused"
            return "Escalate"

        if outcome == "Reward":
            if payout > pool:
                raise gl.vm.UserError("payout exceeds remaining pool")
            submitter = self.cl_submitter[claim_id]
            fee = payout * fee_bps // 10000
            net = payout - fee
            sbal = int(self.balances[submitter]) if submitter in self.balances else 0
            self.balances[submitter] = u256(sbal + net)
            if fee > 0:
                fbal = int(self.balances[self.fee_wallet]) if self.fee_wallet in self.balances else 0
                self.balances[self.fee_wallet] = u256(fbal + fee)
            self.cam_pool[campaign_id] = u256(pool - payout)
            self.cam_paid_total[campaign_id] = u256(int(self.cam_paid_total[campaign_id]) + net)
            self.cl_outcome[claim_id] = "Reward"
            self.cl_status[claim_id] = "rewarded"
            self.cl_payout[claim_id] = u256(net)
            return "Reward"

        if outcome == "HoldForPatch":
            if payout > pool:
                raise gl.vm.UserError("escrow exceeds remaining pool")
            self.cam_pool[campaign_id] = u256(pool - payout)
            self.cam_escrowed[campaign_id] = u256(int(self.cam_escrowed[campaign_id]) + payout)
            self.cl_outcome[claim_id] = "HoldForPatch"
            self.cl_status[claim_id] = "held"
            self.cl_escrowed[claim_id] = u256(payout)
            self.cl_held_at[claim_id] = str(gl.message_raw["datetime"])
            return "HoldForPatch"

        if outcome == "MergeDuplicate":
            dup_seq = int(v["duplicate_of_seq"])
            original_claim_id = self._find_claim_by_seq(campaign_id, dup_seq)
            if original_claim_id == "" or original_claim_id == claim_id:
                raise gl.vm.UserError("original claim for merge not found")
            o_bps = int(v["original_bps"])
            d_bps = int(v["duplicate_bps"])
            if o_bps + d_bps != 10000:
                raise gl.vm.UserError("attribution bps must sum to 10000")
            total = payout
            if total > pool:
                raise gl.vm.UserError("total payout exceeds remaining pool")

            orig_gross = total * o_bps // 10000
            dup_gross = total - orig_gross
            orig_fee = orig_gross * fee_bps // 10000
            dup_fee = dup_gross * fee_bps // 10000
            orig_net = orig_gross - orig_fee
            dup_net = dup_gross - dup_fee

            # always pay the later duplicate its share
            dup_sub = self.cl_submitter[claim_id]
            dbal = int(self.balances[dup_sub]) if dup_sub in self.balances else 0
            self.balances[dup_sub] = u256(dbal + dup_net)
            distributed_net = dup_net
            distributed_fee = dup_fee
            pool_spent = dup_gross

            # pay the FIRST reporter their share ONLY if their claim is still open
            # (never pay an already-resolved original a second time)
            original_open = self.cl_status[original_claim_id] == "open"
            if original_open:
                orig_sub = self.cl_submitter[original_claim_id]
                obal = int(self.balances[orig_sub]) if orig_sub in self.balances else 0
                self.balances[orig_sub] = u256(obal + orig_net)
                distributed_net = distributed_net + orig_net
                distributed_fee = distributed_fee + orig_fee
                pool_spent = pool_spent + orig_gross
                self.cl_outcome[original_claim_id] = "MergeDuplicate"
                self.cl_status[original_claim_id] = "rewarded"
                self.cl_severity[original_claim_id] = severity
                self.cl_payout[original_claim_id] = u256(orig_net)
                self.cl_case_id[original_claim_id] = case_id
                self.cl_merged_with[original_claim_id] = claim_id
                self.cl_attribution_bps[original_claim_id] = u256(o_bps)

            if distributed_fee > 0:
                fbal = int(self.balances[self.fee_wallet]) if self.fee_wallet in self.balances else 0
                self.balances[self.fee_wallet] = u256(fbal + distributed_fee)

            self.cam_pool[campaign_id] = u256(pool - pool_spent)
            self.cam_paid_total[campaign_id] = u256(int(self.cam_paid_total[campaign_id]) + distributed_net)

            self.cl_outcome[claim_id] = "MergeDuplicate"
            self.cl_status[claim_id] = "rewarded"
            self.cl_payout[claim_id] = u256(dup_net)
            self.cl_merged_with[claim_id] = original_claim_id
            self.cl_attribution_bps[claim_id] = u256(d_bps)
            return "MergeDuplicate"

        raise gl.vm.UserError("unknown outcome from verifier")

    # ---------- HoldForPatch completion: release escrow once the fix is verified ----------
    # Permissionless: pays only if the verifier's re-review confirms the fix. No discretion.
    @gl.public.write
    def release_escrow(self, claim_id: str) -> str:
        if claim_id not in self.cl_status:
            raise gl.vm.UserError("unknown claim")
        if self.cl_status[claim_id] != "held":
            raise gl.vm.UserError("claim is not held for patch")
        campaign_id = self.cl_campaign[claim_id]

        vf = gl.get_contract_at(self.verifier)
        fix = vf.view().get_fix_result(claim_id)
        if not fix or "checked" not in fix:
            raise gl.vm.UserError("verifier returned no fix result")
        if not bool(fix["checked"]):
            raise gl.vm.UserError("no patch verification yet; run verify_fix first")
        if not bool(fix["fixed"]):
            raise gl.vm.UserError("fix not verified; escrow not releasable")

        escrowed = int(self.cl_escrowed[claim_id])
        fee_bps = int(self.protocol_fee_bps)
        fee = escrowed * fee_bps // 10000
        net = escrowed - fee
        submitter = self.cl_submitter[claim_id]
        sbal = int(self.balances[submitter]) if submitter in self.balances else 0
        self.balances[submitter] = u256(sbal + net)
        if fee > 0:
            fbal = int(self.balances[self.fee_wallet]) if self.fee_wallet in self.balances else 0
            self.balances[self.fee_wallet] = u256(fbal + fee)
        self.cam_escrowed[campaign_id] = u256(int(self.cam_escrowed[campaign_id]) - escrowed)
        self.cam_paid_total[campaign_id] = u256(int(self.cam_paid_total[campaign_id]) + net)
        self.cl_escrowed[claim_id] = u256(0)
        self.cl_payout[claim_id] = u256(net)
        self.cl_outcome[claim_id] = "Reward"
        self.cl_status[claim_id] = "rewarded"
        return "released"

    # ---------- HoldForPatch completion: refund stuck escrow to the pool ----------
    # Project-gated, and ONLY while the fix is unverified (a verified fix must be
    # released to the submitter, never refunded away from them).
    @gl.public.write
    def refund_escrow(self, claim_id: str) -> str:
        if claim_id not in self.cl_status:
            raise gl.vm.UserError("unknown claim")
        if self.cl_status[claim_id] != "held":
            raise gl.vm.UserError("claim is not held for patch")
        campaign_id = self.cl_campaign[claim_id]
        project = self.cam_project[campaign_id]
        sender = gl.message.sender_address.as_hex.lower()
        if sender != project:
            raise gl.vm.UserError("only the campaign project may refund escrow")

        vf = gl.get_contract_at(self.verifier)
        fix = vf.view().get_fix_result(claim_id)
        if not fix or "checked" not in fix:
            raise gl.vm.UserError("verifier returned no fix result")
        if not bool(fix["checked"]):
            raise gl.vm.UserError(
                "no patch verification yet; run verify_fix before any refund"
            )
        if bool(fix["fixed"]):
            raise gl.vm.UserError("fix is verified; escrow must be released to the submitter")
        # V2: a failed fix is not enough on its own. The researcher gets a grace
        # window from the moment the escrow began before the project may reclaim.
        if claim_id not in self.cl_held_at:
            raise gl.vm.UserError("escrow start time not recorded; refund refused")
        held_at = self._iso_to_epoch(self.cl_held_at[claim_id])
        now_at = self._iso_to_epoch(str(gl.message_raw["datetime"]))
        if now_at - held_at < REFUND_GRACE_SECONDS:
            raise gl.vm.UserError(
                "the refund grace window has not elapsed; the escrow stays with the "
                "claim until it does"
            )

        escrowed = int(self.cl_escrowed[claim_id])
        self.cam_escrowed[campaign_id] = u256(int(self.cam_escrowed[campaign_id]) - escrowed)
        self.cam_pool[campaign_id] = u256(int(self.cam_pool[campaign_id]) + escrowed)
        self.cl_escrowed[claim_id] = u256(0)
        self.cl_payout[claim_id] = u256(0)
        self.cl_outcome[claim_id] = "Reject"
        self.cl_status[claim_id] = "rejected"
        return "refunded"

    # ---------- Escalate completion: project resumes a paused campaign ----------
    @gl.public.write
    def resume_campaign(self, campaign_id: str) -> str:
        if campaign_id not in self.cam_status:
            raise gl.vm.UserError("unknown campaign")
        project = self.cam_project[campaign_id]
        sender = gl.message.sender_address.as_hex.lower()
        if sender != project:
            raise gl.vm.UserError("only the campaign project may resume it")
        if self.cam_status[campaign_id] != "paused":
            raise gl.vm.UserError("campaign is not paused")
        self.cam_status[campaign_id] = "active"
        return "resumed"

    # ---------- claim dismissal (real sender; project or submitter; no payout) ----------
    @gl.public.write
    def dismiss_claim(self, claim_id: str):
        if claim_id not in self.cl_status:
            raise gl.vm.UserError("unknown claim")
        campaign_id = self.cl_campaign[claim_id]
        project = self.cam_project[campaign_id]
        submitter = self.cl_submitter[claim_id]
        sender = gl.message.sender_address.as_hex.lower()
        if sender != project and sender != submitter:
            raise gl.vm.UserError("only the campaign project or the claim submitter can dismiss")
        if self.cl_status[claim_id] != "open":
            raise gl.vm.UserError("only open claims can be dismissed")
        # V2: once consensus has issued a verdict for this claim, no party may
        # dismiss it. The verdict must be settled, not discarded.
        vf = gl.get_contract_at(self.verifier)
        existing_case = str(vf.view().get_case_for_claim(claim_id))
        if existing_case != "":
            raise gl.vm.UserError(
                "this claim already has a consensus verdict and cannot be dismissed; "
                "it must be settled"
            )
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
            "held_at": self.cl_held_at[claim_id] if claim_id in self.cl_held_at else "",
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
