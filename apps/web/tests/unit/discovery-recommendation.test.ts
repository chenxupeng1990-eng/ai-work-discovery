import { describe, expect, it } from "vitest";
import type { ContentItem } from "../../src/lib/schema";
import {
  ADOPTION_LEVEL_OPTIONS,
  DISCOVERY_FORMATS,
  DISCOVERY_TRACKS,
  recommendContent,
  TIME_TO_VALUE_OPTIONS,
  type DiscoveryPreferences,
} from "../../src/lib/discovery-recommendation";

function item(id: string, overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    slug: id,
    title: `Content ${id}`,
    type: "Tool",
    category: "Tools",
    summary: "Used to test discovery recommendations.",
    recommendationReason: "Worth sharing with the team.",
    recommendationTrack: DISCOVERY_TRACKS[1]!,
    timeToValue: TIME_TO_VALUE_OPTIONS[1]!,
    adoptionLevel: ADOPTION_LEVEL_OPTIONS[1]!,
    takeaway: "A reusable setup template.",
    coverImage: "/images/fixtures/codex_environment_screen.png",
    tags: [],
    audience: [],
    scenario: "Team workflow",
    sourceName: "Test source",
    featured: false,
    sortWeight: 0,
    publishedAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    copyBlocks: [],
    ...overrides,
  };
}

const preferences: DiscoveryPreferences = {
  timeToValue: TIME_TO_VALUE_OPTIONS[0]!,
  goal: DISCOVERY_TRACKS[1]!,
  format: DISCOVERY_FORMATS[0]!,
  adoptionLevel: ADOPTION_LEVEL_OPTIONS[0]!,
};

describe("recommendContent", () => {
  it("prioritizes items that match track, time, format, and adoption level together", () => {
    const exact = item("exact", {
      recommendationTrack: preferences.goal,
      timeToValue: preferences.timeToValue,
      adoptionLevel: preferences.adoptionLevel,
      copyBlocks: [{
        id: "copy-1",
        title: "Config",
        type: "Configuration",
        language: "text",
        content: "config",
        order: 0,
      }],
    });
    const sameTrack = item("same-track", { recommendationTrack: preferences.goal });
    const featuredOnly = item("featured-only", {
      recommendationTrack: DISCOVERY_TRACKS[0]!,
      featured: true,
    });

    expect(recommendContent([featuredOnly, sameTrack, exact], preferences).map(({ id }) => id))
      .toEqual(["exact", "same-track", "featured-only"]);
  });

  it("matches format-specific preferences", () => {
    const teamCase = item("team-case", { type: "Case" });
    const tool = item("tool");
    const signal = item("signal", { type: "AI Signal" });

    expect(recommendContent([tool, signal, teamCase], {
      ...preferences,
      format: DISCOVERY_FORMATS[1]!,
    }).map(({ id }) => id)).toEqual(["team-case", "signal", "tool"]);

    expect(recommendContent([tool, signal, teamCase], {
      ...preferences,
      format: DISCOVERY_FORMATS[3]!,
    }).map(({ id }) => id)).toEqual(["signal", "team-case", "tool"]);
  });

  it("breaks score ties by sort weight, updated time, and id", () => {
    const lowWeight = item("z-low", { sortWeight: 1 });
    const highOld = item("b-high-old", {
      sortWeight: 5,
      updatedAt: "2026-07-13T00:00:00.000Z",
    });
    const highNew = item("a-high-new", {
      sortWeight: 5,
      updatedAt: "2026-07-14T00:00:00.000Z",
    });

    expect(recommendContent([lowWeight, highOld, highNew], {
      ...preferences,
      goal: DISCOVERY_TRACKS[0]!,
    }).map(({ id }) => id)).toEqual(["a-high-new", "b-high-old", "z-low"]);
  });

  it("returns an empty list when limit is zero or negative", () => {
    const items = [item("one"), item("two")];

    expect(recommendContent(items, preferences, 0)).toEqual([]);
    expect(recommendContent(items, preferences, -1)).toEqual([]);
  });
});
