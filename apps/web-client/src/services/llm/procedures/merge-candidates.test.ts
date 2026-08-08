import { describe, it, expect } from "vitest";
import { mergeCandidates } from "./merge-candidates";
import type { ProfileSummary, VibeMatchEntry } from "../client";

const profile = (userId: string): ProfileSummary => ({
  userId,
  vibeName: `Vibe ${userId}`,
  energy: "chill",
  moodTags: [],
  styleTags: [],
  interestTags: [],
});

const ranked = (userId: string, narrative = "because"): VibeMatchEntry => ({
  profile: profile(userId),
  narrative,
});

describe("mergeCandidates", () => {
  it("returns every candidate even when the model ranked only some", () => {
    // The real failure: the model was handed 8 and returned 5.
    const all = ["a", "b", "c", "d", "e", "f", "g", "h"].map(profile);
    const modelPicked = [ranked("a"), ranked("c"), ranked("e")];

    const merged = mergeCandidates(modelPicked, all);

    expect(merged).toHaveLength(8);
    expect(merged.map((m) => m.profile.userId).sort()).toEqual(
      all.map((p) => p.userId).sort(),
    );
  });

  it("preserves the model's ordering and puts unranked profiles last", () => {
    const all = ["a", "b", "c"].map(profile);
    const merged = mergeCandidates([ranked("c"), ranked("a")], all);

    expect(merged.map((m) => m.profile.userId)).toEqual(["c", "a", "b"]);
    expect(merged[2].narrative).toBeNull();
  });

  it("does not duplicate a profile the model already ranked", () => {
    const all = ["a", "b"].map(profile);
    const merged = mergeCandidates([ranked("a")], all);

    const ids = merged.map((m) => m.profile.userId);
    expect(ids).toEqual(["a", "b"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flags seeded personas by id prefix and nothing else", () => {
    const all = [profile("demo_maya"), profile("user_3Hc")];
    const merged = mergeCandidates([], all);

    const byId = Object.fromEntries(
      merged.map((m) => [m.profile.userId, m.profile.isDemo]),
    );
    expect(byId["demo_maya"]).toBe(true);
    expect(byId["user_3Hc"]).toBe(false);
  });

  it("returns all candidates when the model returned none", () => {
    // Model failure or an unexpected response shape must not empty Discover.
    const all = ["a", "b", "c"].map(profile);
    expect(mergeCandidates([], all)).toHaveLength(3);
  });

  it("drops malformed entries rather than emitting undefined ids", () => {
    const all = [profile("a")];
    const malformed = [{ profile: undefined, narrative: "x" }] as unknown as VibeMatchEntry[];

    const merged = mergeCandidates(malformed, all);

    expect(merged).toHaveLength(1);
    expect(merged[0].profile.userId).toBe("a");
  });
});
