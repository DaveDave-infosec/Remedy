# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
import hashlib

# V2: the reviewed source must be a COMPLETE, IMMUTABLE artifact.
# The campaign target is commit-pinned (enforced by the vault), the source is
# never truncated (oversize is refused, not silently cut), and the sha256 of the
# exact bytes judged is recorded on the verdict so drift is provable later.
MAX_SOURCE_BYTES = 24000
OVERSIZE_SENTINEL = "__REMEDY_SOURCE_OVERSIZE__"


class RemedyVerifier(gl.Contract):
    # --- config ---
    owner: str
    vault: Address
    vault_set: bool

    # --- verdict output storage (write-once per review, keyed by case_id) ---
    verdict_counter: u256
    case_ids: DynArray[str]
    v_claim_id: TreeMap[str, str]
    v_target_url: TreeMap[str, str]
    v_claimed_severity: TreeMap[str, str]
    v_outcome: TreeMap[str, str]
    v_severity: TreeMap[str, str]
    v_payout: TreeMap[str, u256]
    v_reasoning: TreeMap[str, str]
    v_minority_note: TreeMap[str, str]
    v_patch_assessment: TreeMap[str, str]
    v_is_duplicate: TreeMap[str, bool]
    v_duplicate_of_seq: TreeMap[str, u256]
    v_original_bps: TreeMap[str, u256]
    v_duplicate_bps: TreeMap[str, u256]
    v_source_hash: TreeMap[str, str]

    # --- one authorized verdict per claim ---
    case_for_claim: TreeMap[str, str]

    # --- patch re-verification, keyed by the PATCHED ARTIFACT url (write-once) ---
    fix_checked: TreeMap[str, bool]
    fix_verified: TreeMap[str, bool]
    fix_reasoning: TreeMap[str, str]
    fix_source_hash: TreeMap[str, str]

    def __init__(self, owner_address: str):
        self.owner = owner_address.lower()
        self.vault_set = False
        self.verdict_counter = u256(0)

    # ---------- one-time vault wiring (owner-gated) ----------
    @gl.public.write
    def set_vault(self, vault_address: str):
        sender = gl.message.sender_address.as_hex.lower()
        if sender != self.owner:
            raise gl.vm.UserError("only owner may set the vault")
        if self.vault_set:
            raise gl.vm.UserError("vault already set")
        self.vault = Address(vault_address)
        self.vault_set = True

    # ---------- the core review (canonical state read from the vault) ----------
    @gl.public.write
    def run_review(self, claim_id: str) -> str:
        if not self.vault_set:
            raise gl.vm.UserError("vault not configured")
        if claim_id in self.case_for_claim:
            raise gl.vm.UserError("claim already reviewed")

        vf = gl.get_contract_at(self.vault)
        claim = vf.view().get_claim(claim_id)
        if not claim or "campaign_id" not in claim:
            raise gl.vm.UserError("unknown claim")
        campaign_id = str(claim["campaign_id"])
        campaign = vf.view().get_campaign(campaign_id)
        if not campaign or "status" not in campaign:
            raise gl.vm.UserError("unknown campaign")

        case_id = "remedy_" + str(int(self.verdict_counter))

        local_claim_id = claim_id
        local_url = str(claim["target_url"])
        local_poc = str(claim["poc_text"])
        local_patch = str(claim["patch_diff"])
        local_claimed = str(claim["claimed_severity"])
        local_is_critical = bool(campaign["is_critical_target"])
        pay_c = int(campaign["pay_critical"])
        pay_h = int(campaign["pay_high"])
        pay_m = int(campaign["pay_medium"])
        pay_l = int(campaign["pay_low"])

        prior_claims_json = vf.view().get_priors_json(campaign_id, claim_id)

        priors_text = "(none)"
        try:
            priors = json.loads(prior_claims_json)
        except Exception:
            priors = []
        if len(priors) > 0:
            lines = []
            for p in priors:
                seq_v = str(p.get("seq", "?"))
                sub_at = str(p.get("submitted_at", ""))
                ppoc = str(p.get("poc_text", ""))
                lines.append(
                    "PRIOR CLAIM seq=" + seq_v + " submitted_at=" + sub_at
                    + "\n  PoC: " + ppoc
                )
            priors_text = "\n".join(lines)
        local_priors_text = priors_text

        def fetch_evidence() -> str:
            response = gl.nondet.web.get(local_url)
            body = response.body.decode("utf-8")
            if len(body.encode("utf-8")) > MAX_SOURCE_BYTES:
                return OVERSIZE_SENTINEL
            return body

        evidence = gl.eq_principle.strict_eq(fetch_evidence)
        if evidence == OVERSIZE_SENTINEL:
            raise gl.vm.UserError(
                "target source exceeds the reviewable size limit; the review is "
                "refused rather than judging a partial file"
            )
        local_evidence = evidence
        local_source_hash = hashlib.sha256(local_evidence.encode("utf-8")).hexdigest()

        def get_input() -> str:
            patch_section = local_patch
            if patch_section.strip() == "":
                patch_section = "(no patch submitted)"
            return (
                "TARGET CONTRACT SOURCE (fetched from locked source "
                + local_url + "):\n"
                + local_evidence
                + "\n\nNEW PROOF-OF-CONCEPT (as written by researcher):\n"
                + local_poc
                + "\n\nPROPOSED PATCH DIFF:\n"
                + patch_section
                + "\n\nRESEARCHER-CLAIMED SEVERITY:\n"
                + local_claimed
                + "\n\nPRIOR CLAIMS ON THIS SAME TARGET (for duplicate check):\n"
                + local_priors_text
            )

        task = (
            "You are a security-claim verifier for smart contracts. You judge the "
            "CREDIBILITY of a vulnerability claim from STATIC readable evidence. You "
            "do NOT execute code. Reason only over the TARGET CONTRACT SOURCE, the "
            "NEW PROOF-OF-CONCEPT as written, the PROPOSED PATCH DIFF, and the PRIOR "
            "CLAIMS.\n"
            "STEP 0 DUPLICATE CHECK: You are given PRIOR CLAIMS already submitted "
            "against this same target. Each has a seq number (the on-chain "
            "submission order; LOWER seq = submitted earlier; this ordering is "
            "assigned by the contract and CANNOT be forged or backdated), a "
            "submitted_at timestamp, and its PoC text. Compare the NEW claim's root "
            "cause against each prior claim.\n"
            "- If the NEW claim describes the SAME underlying vulnerability (same "
            "root cause / same vulnerable code path) as a prior claim, it is a "
            "DUPLICATE. Set outcome = MergeDuplicate, set duplicate_of_seq to that "
            "prior claim's seq, and determine an ATTRIBUTION SPLIT between the FIRST "
            "reporter (the prior claim, lower seq) and this later duplicate.\n"
            "  * Weight the FIRST reporter more heavily; they found it first. Start "
            "from a first-reporter-favored baseline and adjust for QUALITY and "
            "COMPLETENESS: if the later report is substantially more complete, "
            "actionable, or includes a working patch while the first was thin, "
            "narrow the gap. Never let the later duplicate's share exceed the first "
            "reporter's share unless the first report is near-useless.\n"
            "  * Express the split as original_bps (first reporter) and "
            "duplicate_bps (later reporter): integers that sum to EXACTLY 10000.\n"
            "- If NO prior claim shares the root cause (or there are no priors), the "
            "claim is NOVEL: set duplicate_of_seq = -1, original_bps = 10000, "
            "duplicate_bps = 0, and continue to the assessment below.\n"
            "STEP 1 CREDIBILITY (novel claims): Does the target source genuinely "
            "exhibit the vulnerability class the PoC describes (reentrancy, access "
            "control, integer overflow, unchecked external call, oracle "
            "manipulation, etc.)? Does the PoC, as written, plausibly trigger that "
            "flaw in THIS code? A PoC describing a flaw the code does not contain is "
            "NOT credible.\n"
            "STEP 2 SEVERITY: Assign severity Critical, High, Medium, or Low from "
            "impact (funds at risk, scope, exploitability). This is YOUR judgment; "
            "the claimed severity is only a hint. For a MergeDuplicate, severity is "
            "the shared vulnerability's severity.\n"
            "STEP 3 PATCH: If a patch diff is present, judge whether it plausibly "
            "closes the specific flaw, and note in one phrase whether it plausibly "
            "introduces a regression. If no patch, patch_assessment is 'none "
            "submitted'.\n"
            "OUTCOME (choose one):\n"
            "- Reward   : credible, real flaw, no patch-gating needed. Pay per "
            "severity.\n"
            "- Reject   : not credible; code does not exhibit the claimed flaw, PoC "
            "does not match the code, or a gaming attempt. Payout 0.\n"
            "- HoldForPatch : credible AND a patch was submitted; payout escrowed "
            "until the deployed fix is verified.\n"
            "- Escalate : the target is a predefined critical target AND the claim "
            "is credible at Critical severity; requires emergency governance.\n"
            "- MergeDuplicate : the claim duplicates a prior claim's root cause; the "
            "bounty splits per attribution (see STEP 0).\n"
            "PAYOUT: For the severity you assign, payout is: Critical=" + str(pay_c)
            + ", High=" + str(pay_h) + ", Medium=" + str(pay_m) + ", Low="
            + str(pay_l) + ". For Reject, payout is 0. For MergeDuplicate, payout is "
            "the schedule amount for the shared vulnerability's severity (the TOTAL "
            "bounty to be split by original_bps / duplicate_bps).\n"
            "CRITICAL-TARGET FLAG: is_critical_target is "
            + ("TRUE" if local_is_critical else "FALSE")
            + ". Only choose Escalate if that flag is TRUE, severity is Critical, "
            "and the claim is credible. Duplicate detection takes precedence: if "
            "the claim is a duplicate, choose MergeDuplicate even on a critical "
            "target.\n"
            "Return ONLY one JSON object with keys: outcome (one of Reward, Reject, "
            "HoldForPatch, Escalate, MergeDuplicate), severity (one of Critical, "
            "High, Medium, Low, or None if Reject), payout (integer), "
            "patch_assessment (short string), reasoning (1-3 sentences grounded in "
            "the actual code), minority_note (one sentence; for MergeDuplicate, the "
            "strongest argument for a different attribution split; otherwise the "
            "strongest dissenting view, or empty string), duplicate_of_seq (integer; "
            "-1 if novel), original_bps (integer), duplicate_bps (integer)."
        )
        criteria_check = (
            "The response is exactly one valid JSON object. outcome is one of "
            "Reward, Reject, HoldForPatch, Escalate, MergeDuplicate. severity is one "
            "of Critical, High, Medium, Low, None and matches the judgment. payout "
            "is an integer equal to the correct schedule amount for the assigned "
            "severity, or 0 for Reject. reasoning is a non-empty string grounded in "
            "the actual code. duplicate_of_seq is an integer (-1 when novel). "
            "original_bps and duplicate_bps are integers that sum to exactly 10000. "
            "If outcome is MergeDuplicate, duplicate_of_seq is a real prior seq (not "
            "-1) and the split favors the first reporter unless justified otherwise."
        )

        raw = gl.eq_principle.prompt_non_comparative(
            get_input,
            task=task,
            criteria=criteria_check,
        )

        parsed = json.loads(raw)
        outcome = str(parsed["outcome"])
        severity = str(parsed["severity"])
        payout = int(parsed["payout"])
        patch_assessment = str(parsed["patch_assessment"])
        reasoning = str(parsed["reasoning"])
        minority_note = str(parsed["minority_note"])
        dup_seq = int(parsed["duplicate_of_seq"])
        original_bps = int(parsed["original_bps"])
        duplicate_bps = int(parsed["duplicate_bps"])

        is_dup = outcome == "MergeDuplicate"
        stored_dup_seq = dup_seq if (is_dup and dup_seq >= 0) else 0

        self.verdict_counter = u256(int(self.verdict_counter) + 1)
        self.case_ids.append(case_id)
        self.v_claim_id[case_id] = local_claim_id
        self.v_target_url[case_id] = local_url
        self.v_claimed_severity[case_id] = local_claimed
        self.v_outcome[case_id] = outcome
        self.v_severity[case_id] = severity
        self.v_payout[case_id] = u256(payout if payout > 0 else 0)
        self.v_reasoning[case_id] = reasoning
        self.v_minority_note[case_id] = minority_note
        self.v_patch_assessment[case_id] = patch_assessment
        self.v_is_duplicate[case_id] = is_dup
        self.v_duplicate_of_seq[case_id] = u256(stored_dup_seq)
        self.v_original_bps[case_id] = u256(original_bps if original_bps > 0 else 0)
        self.v_duplicate_bps[case_id] = u256(duplicate_bps if duplicate_bps > 0 else 0)
        self.v_source_hash[case_id] = local_source_hash

        self.case_for_claim[local_claim_id] = case_id

        return case_id

    # ---------- patch re-verification: judge a SUBMITTED patched artifact ----------
    # V2 patch flow: judge the claim's SUBMITTED patched artifact (a NEW
    # commit-pinned URL, read canonically from the vault), NOT the unchanged
    # original. One immutable verdict per artifact: the same patched URL can
    # never be re-judged; a genuinely different artifact gets a fresh verdict.
    @gl.public.write
    def verify_fix(self, claim_id: str) -> bool:
        if not self.vault_set:
            raise gl.vm.UserError("vault not configured")

        vf = gl.get_contract_at(self.vault)
        claim = vf.view().get_claim(claim_id)
        if not claim or "target_url" not in claim:
            raise gl.vm.UserError("unknown claim")

        patched_url = str(claim["patched_url"]) if "patched_url" in claim else ""
        if patched_url == "":
            raise gl.vm.UserError("no patched artifact submitted for this claim")
        if patched_url in self.fix_checked and self.fix_checked[patched_url]:
            raise gl.vm.UserError("this patched artifact already has a fix verdict")

        local_poc = str(claim["poc_text"])
        local_url = patched_url

        def fetch_patched() -> str:
            response = gl.nondet.web.get(local_url)
            body = response.body.decode("utf-8")
            if len(body.encode("utf-8")) > MAX_SOURCE_BYTES:
                return OVERSIZE_SENTINEL
            return body

        patched = gl.eq_principle.strict_eq(fetch_patched)
        if patched == OVERSIZE_SENTINEL:
            raise gl.vm.UserError(
                "patched artifact exceeds the reviewable size limit; the fix check is "
                "refused rather than judging a partial file"
            )
        local_patched = patched
        local_fix_hash = hashlib.sha256(local_patched.encode("utf-8")).hexdigest()

        def get_input() -> str:
            return (
                "ORIGINAL VULNERABILITY (previously reported and accepted):\n"
                + local_poc
                + "\n\nPROPOSED PATCHED CONTRACT SOURCE (a new commit-pinned artifact, "
                "fetched from " + local_url + "):\n"
                + local_patched
            )

        task = (
            "You are verifying whether a previously accepted smart-contract "
            "vulnerability has been FIXED in a PROPOSED PATCHED source. You are given "
            "the ORIGINAL VULNERABILITY description and the PATCHED source fetched from "
            "a new commit-pinned artifact. Judge ONLY from the static code. Decide "
            "whether the specific flaw described is now genuinely closed in the patched "
            "source (a proper check added, ordering corrected, a guard in place, and so "
            "on). Do NOT accept a cosmetic or unrelated change as a fix. Return ONLY one "
            "JSON object with keys: fixed (boolean; true only if the original flaw is "
            "genuinely closed in the patched source), reasoning (1-2 sentences grounded "
            "in the actual patched code)."
        )
        criteria_check = (
            "The response is exactly one valid JSON object with a boolean 'fixed' "
            "and a non-empty 'reasoning' grounded in the patched source. 'fixed' is "
            "true only when the specific original flaw is genuinely closed."
        )

        raw = gl.eq_principle.prompt_non_comparative(
            get_input,
            task=task,
            criteria=criteria_check,
        )

        parsed = json.loads(raw)
        fixed = bool(parsed["fixed"])
        reasoning = str(parsed["reasoning"])

        self.fix_checked[patched_url] = True
        self.fix_verified[patched_url] = fixed
        self.fix_reasoning[patched_url] = reasoning
        self.fix_source_hash[patched_url] = local_fix_hash
        return fixed

    # ---------- views ----------
    @gl.public.view
    def get_verdict(self, case_id: str) -> dict:
        if case_id not in self.v_outcome:
            return {}
        return {
            "case_id": case_id,
            "claim_id": self.v_claim_id[case_id],
            "target_url": self.v_target_url[case_id],
            "claimed_severity": self.v_claimed_severity[case_id],
            "outcome": self.v_outcome[case_id],
            "severity": self.v_severity[case_id],
            "payout": int(self.v_payout[case_id]),
            "patch_assessment": self.v_patch_assessment[case_id],
            "reasoning": self.v_reasoning[case_id],
            "minority_note": self.v_minority_note[case_id],
            "is_duplicate": self.v_is_duplicate[case_id],
            "duplicate_of_seq": int(self.v_duplicate_of_seq[case_id]),
            "original_bps": int(self.v_original_bps[case_id]),
            "duplicate_bps": int(self.v_duplicate_bps[case_id]),
            "source_hash": self.v_source_hash[case_id] if case_id in self.v_source_hash else "",
        }

    @gl.public.view
    def get_case_for_claim(self, claim_id: str) -> str:
        return self.case_for_claim[claim_id] if claim_id in self.case_for_claim else ""

    @gl.public.view
    def get_fix_result(self, patched_url: str) -> dict:
        if patched_url not in self.fix_checked:
            return {"checked": False, "fixed": False, "reasoning": "", "source_hash": ""}
        return {
            "checked": True,
            "fixed": self.fix_verified[patched_url],
            "reasoning": self.fix_reasoning[patched_url],
            "source_hash": self.fix_source_hash[patched_url] if patched_url in self.fix_source_hash else "",
        }

    @gl.public.view
    def get_verdict_count(self) -> int:
        return int(self.verdict_counter)

    @gl.public.view
    def get_all_case_ids(self) -> list:
        out = []
        for i in range(len(self.case_ids) - 1, -1, -1):
            out.append(self.case_ids[i])
        return out