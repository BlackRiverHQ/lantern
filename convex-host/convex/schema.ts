import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per print the demo feed made, so the rate limits are counted from what happened.
  prints: defineTable({
    at: v.number(),
    borrower: v.string(),
    kind: v.string(),
    caseId: v.number(),
    ok: v.boolean(),
    hashes: v.array(v.string()),
    note: v.optional(v.string()),
  }).index("by_at", ["at"]).index("by_borrower_at", ["borrower", "at"]),
  // A single signing key has a single nonce sequence: two prints in flight would collide, so they
  // take turns. The lock expires on its own if an action dies holding it.
  locks: defineTable({ name: v.string(), until: v.number() }).index("by_name", ["name"]),
});
