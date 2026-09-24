import { useState, useEffect, useCallback } from "react";
import { useWallet } from "./lib/useWallet";
import { Copyable } from "./components/Copyable";
import { OpenCampaign } from "./components/OpenCampaign";
import { CampaignList } from "./components/CampaignList";
import { CampaignDetail } from "./components/CampaignDetail";
import { HowItWorks } from "./components/HowItWorks";
import { Guide } from "./components/Guide";
import { Landing } from "./components/Landing";
import { balanceOf, mint, faucet, hasClaimedFaucet, getConfig } from "./lib/contracts";
import "./index.css";

type Tab = "protocol" | "how" | "guide";

export default function App() {
  const { address, mode, connectMetaMask, useDemo, newDemoWallet, disconnect } = useWallet();
  const [view, setView] = useState<"landing" | "app">("landing");
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("protocol");
  const [ownerAddr, setOwnerAddr] = useState<string | null>(null);
  const [claimedFaucet, setClaimedFaucet] = useState(false);

  useEffect(() => {
    getConfig()
      .then((c) => setOwnerAddr(String(c.owner).toLowerCase()))
      .catch(() => setOwnerAddr(null));
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const b = await balanceOf(address);
      setBalance(b);
      const claimed = await hasClaimedFaucet(address);
      setClaimedFaucet(claimed);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) refresh();
  }, [address, refresh]);

  const isOwner = address !== null && ownerAddr !== null && address.toLowerCase() === ownerAddr;

  async function mintSelf() {
    if (!address) return;
    setMinting(true);
    setError(null);
    try {
      await mint(address, 50000);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setMinting(false);
    }
  }

  async function getFaucet() {
    setMinting(true);
    setError(null);
    try {
      await faucet();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setMinting(false);
    }
  }

  async function bumpRefresh() {
    setRefreshKey((k) => k + 1);
    await refresh();
  }

  if (view === "landing") {
    return <Landing onEnter={() => setView("app")} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="masthead">
          <span className="brand" style={{ cursor: "pointer" }} onClick={() => setView("landing")}>REMEDY</span>
          <span className="register-line">security resolution protocol</span>
        </div>
        <span className="tagline">Consensus security settlement</span>
      </header>

      <nav className="app-nav">
        <button
          className={"nav-tab " + (tab === "protocol" ? "nav-active" : "")}
          onClick={() => {
            setTab("protocol");
            setSelected(null);
          }}
        >
          Protocol
        </button>
        <button
          className={"nav-tab " + (tab === "how" ? "nav-active" : "")}
          onClick={() => setTab("how")}
        >
          How It Works
        </button>
        <button
          className={"nav-tab " + (tab === "guide" ? "nav-active" : "")}
          onClick={() => setTab("guide")}
        >
          Guide
        </button>
      </nav>

      <section className="bar">
        {address ? (
          <div className="wallet">
            <span className={"mode-badge mode-" + mode}>{mode}</span>
            <Copyable
              text={address}
              display={address.slice(0, 6) + "…" + address.slice(-4)}
              className="mono"
            />
            {balance !== null && <span className="balance mono">{balance} genUSDC</span>}
            {isOwner ? (
              <button onClick={mintSelf} disabled={minting || loading}>
                {minting ? "Minting…" : "Mint 50000"}
              </button>
            ) : (
              <button onClick={getFaucet} disabled={minting || loading || claimedFaucet}>
                {minting ? "Claiming…" : claimedFaucet ? "Faucet claimed" : "Get test faucet"}
              </button>
            )}
            <button onClick={refresh} disabled={loading || minting}>
              {loading ? "Reading…" : "Refresh"}
            </button>
            {mode === "demo" && (
              <button className="link" onClick={newDemoWallet} disabled={loading || minting}>
                new demo wallet
              </button>
            )}
            <button className="link" onClick={disconnect} disabled={loading || minting}>
              disconnect
            </button>
          </div>
        ) : (
          <div className="wallet">
            <button className="primary" onClick={connectMetaMask}>
              Connect MetaMask
            </button>
            <button onClick={useDemo}>Demo mode</button>
          </div>
        )}
      </section>

      {error && <div className="error mono top-error">{error}</div>}

      <main className="app-main">
        {tab === "how" && <HowItWorks />}
        {tab === "guide" && <Guide />}
        {tab === "protocol" &&
          (address ? (
            selected ? (
              <CampaignDetail
                account={address}
                campaignId={selected}
                disabled={loading || minting}
                onBack={() => {
                  setSelected(null);
                  bumpRefresh();
                }}
              />
            ) : (
              <>
                <div className="protocol-grid">
                  <OpenCampaign account={address} balance={balance} disabled={loading || minting} onOpened={bumpRefresh} />
                  <aside className="panel side-note">
                    <h3>What a campaign does</h3>
                    <div className="side-step">
                      <span className="side-n">01</span>
                      <span className="side-t">
                        Your pool is locked in the vault. Nothing pays out unless consensus
                        says so.
                      </span>
                    </div>
                    <div className="side-step">
                      <span className="side-n">02</span>
                      <span className="side-t">
                        Every target is pinned to a commit, so the code judged cannot change
                        after a claim is filed.
                      </span>
                    </div>
                    <div className="side-step">
                      <span className="side-n">03</span>
                      <span className="side-t">
                        Each claim locks a bond. It returns on any credible outcome and is
                        forfeited to your pool on Reject.
                      </span>
                    </div>
                    <p className="side-foot">
                      Settlement is permissionless: anyone can trigger it, and the vault
                      recomputes the payout from your own schedule.
                    </p>
                  </aside>
                </div>
                <CampaignList refreshKey={refreshKey} onSelect={(id) => setSelected(id)} />
              </>
            )
          ) : (
            <div className="panel">
              <div className="gate">
                <div>
                  <h2 className="gate-head">Connect to begin</h2>
                  <p className="gate-body">
                    Open a campaign, file a claim, run the review, and settle it. The whole
                    loop runs on-chain, and nothing here needs real funds.
                  </p>
                </div>
                <div className="gate-list">
                  <div className="gate-item">
                    <span className="gate-k">01</span>
                    <span>
                      Demo mode gives you a throwaway wallet and a faucet. Nothing to install.
                    </span>
                  </div>
                  <div className="gate-item">
                    <span className="gate-k">02</span>
                    <span>
                      MetaMask signs real transactions on the GenLayer Studio network.
                    </span>
                  </div>
                  <div className="gate-item">
                    <span className="gate-k">03</span>
                    <span>New here? The Guide tab walks the full loop end to end.</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
      </main>
    </div>
  );
}
