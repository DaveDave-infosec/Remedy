# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class RemedyVerifier(gl.Contract):
    # --- config ---
    owner: str

    # --- verdict output storage (write-once per review, keyed by case_id) ---
    verdict_counter: u256
    case_ids: DynArray[str]
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

    def __init__(self, owner_address: str):
        self.owner = owner_address.lower()
        self.verdict_counter = u256(0)

    # ---------- the core review (single claim + dedup against priors) ----------
    @gl.public.write
    def run_review(
        self,
        target_url: str,
        poc_text: str,
        patch_diff: str,
        claimed_severity: str,
        sev_critical_payout: int,
        sev_high_payout: int,
        sev_medium_payout: int,
        sev_low_payout: int,
        is_critical_target: bool,
        prior_claims_json: str,
    ) -> str:
        case_id = "remedy_" + str(int(self.verdict_counter))

        local_url = target_url
        local_poc = poc_text
        local_patch = patch_diff
        local_claimed = claimed_severity
        local_is_critical = is_critical_target
        pay_c = int(sev_critical_payout)
        pay_h = int(sev_high_payout)
        pay_m = int(sev_medium_payout)
        pay_l = int(sev_low_payout)

        # build a readable priors block (deterministic, from param)
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
            return body[:3000]

        evidence = gl.eq_principle.strict_eq(fetch_evidence)
        local_evidence = evidence

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

        return case_id

    # ---------- views ----------
    @gl.public.view
    def get_verdict(self, case_id: str) -> dict:
        if case_id not in self.v_outcome:
            return {}
        return {
            "case_id": case_id,
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
