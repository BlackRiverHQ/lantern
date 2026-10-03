import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: "12vh auto", padding: "0 24px" }}>
      <h1 style={{ fontFamily: "var(--head)", fontSize: 26, margin: "0 0 10px" }}>Not a page here</h1>
      <p style={{ color: "var(--ink-3)", margin: "0 0 18px" }}>
        The dashboard is at <Link href="/dashboard/" style={{ textDecoration: "underline" }}>/dashboard</Link>.
      </p>
      <a className="btn" href="/dashboard/">Open the dashboard</a>
    </main>
  );
}
