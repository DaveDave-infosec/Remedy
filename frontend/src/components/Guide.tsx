export function Guide() {
  return (
    <div className="doc">
      <h2>Guide</h2>
      <p className="doc-lead">
        New to Remedy? This walks you from nothing to a settled security claim. No
        prior wallet or crypto experience needed — you can try the whole thing with a
        throwaway demo wallet.
      </p>

      <h3>1. Get a wallet</h3>
      <p>
        You have two options in the wallet bar at the top:
      </p>
      <ul className="doc-list">
        <li>
          <span className="doc-step">Demo mode</span> — the fastest way in. One click
          creates a throwaway wallet in your browser, no installation, no signing
          popups. Perfect for trying Remedy. This is the recommended path if you do not
          already use MetaMask.
        </li>
        <li>
          <span className="doc-step">Connect MetaMask</span> — for real signed
          transactions if you have the MetaMask extension installed.
        </li>
      </ul>
      <p>
        Once connected, click <span className="doc-kbd">Mint 50000</span> to give
        yourself test funds (genUSDC). These are testnet tokens with no real value.
      </p>

      <h3>2. Open a campaign</h3>
      <p>
        On the <span className="doc-kbd">Protocol</span> tab, fill in the &ldquo;Open a
        security campaign&rdquo; form: paste a target contract&rsquo;s source URL (a raw
        GitHub link to a Solidity file works), set a bounty pool, and adjust the
        per-severity payouts if you like. Click <span className="doc-kbd">Open
        campaign</span>. Your campaign appears in the list below.
      </p>

      <h3>3. Submit a claim</h3>
      <p>
        Click your campaign to open it, then scroll to &ldquo;Submit a claim.&rdquo;
        Describe the vulnerability in the proof-of-concept box — how it triggers, in
        the target&rsquo;s code. Optionally paste a patch diff (this routes the claim to
        Hold-for-Patch). Pick a claimed severity as a hint, then submit. Your claim
        appears with a hollow seal — unverified, awaiting review.
      </p>

      <h3>4. Run the review</h3>
      <p>
        On your claim, click <span className="doc-kbd">Run review</span>. Validators
        fetch the locked target source and reason over it live — you&rsquo;ll watch the
        review climb through its phases: intake &amp; dedup, credibility, severity,
        patch, settlement. This takes a moment; it is real consensus work, not a
        canned animation.
      </p>
      <p>
        A verdict appears: the outcome, the severity consensus assigned, the reasoning
        grounded in the actual code, and a minority note. No money has moved yet.
      </p>

      <h3>5. Settle</h3>
      <p>
        Read the verdict, then click the <span className="doc-kbd">Settle</span> button
        — it is labeled with the outcome (Settle: Reward, Settle: merge split, and so
        on). This relays the verdict on-chain and moves the money. The seal strikes in
        its severity color, and the claim&rsquo;s timeline advances to settled.
      </p>

      <h3>Reading a claim</h3>
      <ul className="doc-list">
        <li>
          <span className="doc-step">The seal</span> — the octagonal stamp. Hollow means
          unverified. Struck and filled means consensus confirmed; its color is the
          severity (red critical, amber high, gold medium, sage low). A grey VOID seal
          means the claim was dismissed.
        </li>
        <li>
          <span className="doc-step">The timeline</span> — the row of nodes under each
          claim, tracing its path: submitted, reviewed, severity set, settled. A
          Hold-for-Patch claim shows a longer path; an escalated one ends in red; a
          merged duplicate shows which claim it merged with.
        </li>
        <li>
          <span className="doc-step">The chips</span> — the small labels show status and
          outcome at a glance.
        </li>
      </ul>

      <h3 className="doc-scope">For reviewers</h3>
      <div className="doc-callout doc-callout-review">
        <p>
          To verify Remedy is doing real work and not theater: run a review on a claim
          and watch the verdict&rsquo;s reasoning. It cites the specific vulnerable code
          from the target source the validators fetched — the exact function, the exact
          flaw. Submit a claim describing a flaw the code does not have, and consensus
          rejects it. The judgment is genuine, and every verdict is recorded on-chain
          against a case id you can read back.
        </p>
      </div>
    </div>
  );
}
