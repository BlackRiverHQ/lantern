import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";

const http = httpRouter();

// The dashboard is a static export: every route is an index.html under its own directory, and static
// hosting matches exact file paths only, so each clean URL is sent on to its file. Exact routes only —
// a pathPrefix here would shadow the component's own routes and 404 the files under it. The query
// string rides along, because the cases view reads the selected case from it.
const FILE: Record<string, string> = {
  "/dashboard": "/dashboard/index.html",
  "/dashboard/": "/dashboard/index.html",
  "/dashboard/cases": "/dashboard/cases/index.html",
  "/dashboard/cases/": "/dashboard/cases/index.html",
  "/dashboard/run": "/dashboard/run/index.html",
  "/dashboard/run/": "/dashboard/run/index.html",
  "/dashboard/prove": "/dashboard/prove/index.html",
  "/dashboard/prove/": "/dashboard/prove/index.html",
  "/dashboard/feeds": "/dashboard/feeds/index.html",
  "/dashboard/feeds/": "/dashboard/feeds/index.html",
};
const toFile = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  const to = FILE[url.pathname];
  if (!to) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 308, headers: { Location: to + url.search } });
});
for (const path of Object.keys(FILE)) {
  http.route({ path, method: "GET", handler: toFile });
}

// The demo feed: a visitor's wallet cannot print (the contract allows only the feed's operator), so
// the three prints a case needs are made here, by the operator key, with every value derived from
// the chain. Same origin as the site, so no CORS is offered.
http.route({
  path: "/api/print",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let b: any;
    try { b = await request.json(); } catch { b = null; }
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    if (!b || typeof b !== "object") return json(400, { error: "send a JSON body" });
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : -1);
    const r = await ctx.runAction(internal.feed.run, {
      kind: String(b.kind || ""), caseId: n(b.caseId), r1: n(b.r1), r2: n(b.r2),
      gap: n(b.gap), borrower: String(b.borrower || ""),
    });
    return json(r.status, r.body);
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
