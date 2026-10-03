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
  { href: "/dashboard/prove/", label: "Prove a price", view: "prove" },
  { href: "/dashboard/feeds/", label: "Feeds & bonds", view: "feeds" },
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
  // "/dashboard/" is a prefix of every route, so the deepest match wins — otherwise the crumb and the
  // highlight both stay stuck on Overview on every page.
  const current = [...NAV].sort((a, b) => b.href.length - a.href.length).find((n) => path.startsWith(n.href)) || NAV[0];

  const wrong = mounted && p.account && p.chain !== null && p.chain !== CFG.chainId;
  const label = !mounted ? "Connect wallet" : !p.account ? "Connect wallet" : wrong ? "Switch network" : short(p.account);

  return (
    <div className="app">
      <aside className={"side" + (menu ? " open" : "")}>
        {/* The root is the landing page, not a route of this app: there is no payload for the router
            to fetch, so a Link here asks for one and 404s. A plain anchor loads the page it names. */}
        <a className="brand" href="/" aria-label="Lantern home"><span className="word">Lantern</span></a>
        <div className="side-group">Protocol</div>
        <nav className="side-nav" aria-label="Dashboard">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={n.href === current.href ? "active" : ""}>
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
  if (view === "prove") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 3.5 5v5c0 4 2.8 6.6 6.5 7.5 3.7-.9 6.5-3.5 6.5-7.5V5z" /><path d="M7.6 10.2l1.8 1.8 3.4-3.6" /></svg>
    );
  }
  if (view === "feeds") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.5h14v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M7 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" /><path d="M3 10.5h14" /></svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 15V9M10 15V5M16 15v-4" />
    </svg>
  );
}
