import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";

const http = httpRouter();

// The landing page links to /dashboard. Static hosting matches exact file paths only, so the
// clean URL is sent on to the file; the browser keeps the #view fragment across the redirect.
const toDashboard = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  return new Response(null, {
    status: 308,
    headers: { Location: `${url.origin}/dashboard/index.html${url.search}` },
  });
});
http.route({ path: "/dashboard", method: "GET", handler: toDashboard });
http.route({ path: "/dashboard/", method: "GET", handler: toDashboard });

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
