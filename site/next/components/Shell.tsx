"use client";

/* Shell.tsx — the frame: who you are, which chain you are on, which view you are in, and the one
   number that says whether anything needs a decision. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useProtocol } from "./protocol";
import { attention } from "@/lib/attention";
import { short } from "@/lib/format";
import { config } from "@/lib/chain/config";

const NAV = [
  { href: "/dashboard/", label: "Overview", view: "overview" },
  { href: "/dashboard/cases/", label: "Cases", view: "cases" },
  { href: "/dashboard/run/", label: "Run a case", view: "run" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const p = useProtocol();
  const path = usePathname() || "/dashboard/";
  const [menu, setMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const CFG = config();
  const rows = p.s ? attention(p.s, p.cases, p.now, p.account) : [];
  const alarms = rows.filter((r) => r.action).length;
  const current = NAV.find((n) => path.startsWith(n.href)) || NAV[0];

  const wrong = mounted && p.account && p.chain !== null && p.chain !== CFG.chainId;
  const label = !mounted ? "Connect wallet" : !p.account ? "Connect wallet" : wrong ? "Switch network" : short(p.account);

  return (
    <div className="app">
      <aside className={"side" + (menu ? " open" : "")}>
        <Link className="brand" href="/" aria-label="Lantern home"><span className="word">Lantern</span></Link>
        <div className="side-group">Protocol</div>
        <nav className="side-nav" aria-label="Dashboard">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "active" : ""}>
              <Icon view={n.view} />
              {n.label}
              {n.view === "cases" && p.casesLoaded ? <span className="count">{p.cases.length}</span> : null}
              {n.view === "overview" && alarms > 0 ? <span className="count alarm">{alarms}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="net">
            <span className={"dot " + (p.online ? "ok" : "bad")} />
            <span>{p.online ? "Live" : "Offline"}</span>
          </div>
          <div className="side-meta">Arbitrum Sepolia testnet</div>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <button className="menu" aria-label="Open menu" onClick={() => setMenu((m) => !m)}>
            <span /><span />
          </button>
          <div className="crumbs">{current.label}</div>
          <div className="top-right">
            <span className="chip">{p.s ? "block " + p.s.block.toLocaleString("en-US") : "block \u2014"}</span>
            <button className="wallet-btn" onClick={p.connectOrSwitch}>
              <span className={"dot " + (!mounted || !p.account ? "" : wrong ? "bad" : "ok")} />
              {label}
            </button>
          </div>
        </header>
        {children}
        <footer className="foot">
          <span>©2026 Lantern</span>
          <span>Testnet only. No real funds.</span>
        </footer>
      </div>
    </div>
  );
}

function Icon({ view }: { view: string }) {
  if (view === "cases") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12" /></svg>
    );
  }
  if (view === "run") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4v12l10-6z" /></svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 15V9M10 15V5M16 15v-4" />
    </svg>
  );
}
