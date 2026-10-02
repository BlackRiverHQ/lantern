"use node";
// The demo feed's signer. The key lives only in this deployment's environment (FEED_PRIVATE_KEY);
// it is never sent to the browser and never logged.
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { makeClients, print, Refusal } from "./lib/feedCore.js";

export const run = internalAction({
  args: {
    kind: v.string(), caseId: v.number(), r1: v.number(), r2: v.number(),
    gap: v.number(), borrower: v.string(),
  },
  handler: async (ctx, req) => {
    const key = process.env.FEED_PRIVATE_KEY;
    if (!key) return { status: 503, body: { error: "the demo feed is not configured" } };
    const borrower = req.borrower.toLowerCase();

    // wait our turn for the signing key, briefly
    let gate = await ctx.runMutation(internal.limits.reserve, { borrower });
    for (let i = 0; i < 20 && !gate.ok && gate.busy; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      gate = await ctx.runMutation(internal.limits.reserve, { borrower });
    }
    if (!gate.ok) return { status: 429, body: { error: gate.why } };

    let out: any = null, err: any = null;
    try {
      const c = makeClients(key.startsWith("0x") ? key : "0x" + key, process.env.RPC_URL);
      out = await print(c, req);
    } catch (e: any) { err = e; }

    await ctx.runMutation(internal.limits.finish, {
      borrower, kind: req.kind, caseId: req.caseId, ok: !!out,
      hashes: out ? out.hashes : [], note: err ? String(err.message || err).slice(0, 300) : undefined,
    });
    if (out) return { status: 200, body: out };
    if (err instanceof Refusal || err?.refusal) return { status: 409, body: { error: err.message, ...err.extra } };
    // an outage is reported as one, without the internals
    console.error("print failed", err?.shortMessage || err?.message || err);
    return { status: 502, body: { error: "the demo feed could not reach the chain; try again" } };
  },
});
