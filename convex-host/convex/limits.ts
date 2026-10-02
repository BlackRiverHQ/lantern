import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const LOCK = "feed";
const LOCK_MS = 120_000;
// Limits sized to a demo, not a service: a full case needs three prints.
const PER_WALLET_PER_10MIN = 9;
const GLOBAL_PER_HOUR = 30;     // ten cases an hour across everyone

/** Take the signing lock and check the limits in one serializable step. */
export const reserve = internalMutation({
  args: { borrower: v.string() },
  handler: async (ctx, { borrower }) => {
    const now = Date.now();
    const mine = await ctx.db
      .query("prints")
      .withIndex("by_borrower_at", (q) => q.eq("borrower", borrower).gt("at", now - 600_000))
      .collect();
    if (mine.filter((p) => p.ok).length >= PER_WALLET_PER_10MIN) {
      return { ok: false, why: "this wallet has used the demo feed a lot in the last ten minutes; try again shortly" };
    }
    const all = await ctx.db.query("prints").withIndex("by_at", (q) => q.gt("at", now - 3_600_000)).collect();
    if (all.filter((p) => p.ok).length >= GLOBAL_PER_HOUR) {
      return { ok: false, why: "the demo feed is at its hourly limit; try again later" };
    }
    const lock = await ctx.db.query("locks").withIndex("by_name", (q) => q.eq("name", LOCK)).first();
    if (lock && lock.until > now) return { ok: false, busy: true, why: "the demo feed is printing for someone else; retrying" };
    if (lock) await ctx.db.patch(lock._id, { until: now + LOCK_MS });
    else await ctx.db.insert("locks", { name: LOCK, until: now + LOCK_MS });
    return { ok: true };
  },
});

export const finish = internalMutation({
  args: {
    borrower: v.string(), kind: v.string(), caseId: v.number(), ok: v.boolean(),
    hashes: v.array(v.string()), note: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("prints", { at: Date.now(), ...a });
    const lock = await ctx.db.query("locks").withIndex("by_name", (q) => q.eq("name", LOCK)).first();
    if (lock) await ctx.db.patch(lock._id, { until: 0 });
  },
});
