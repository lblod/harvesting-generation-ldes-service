import { addMembers } from "../lib/ldes";
import { generateFeed } from "../lib/pipeline-generating-ldes";

jest.mock("../lib/ldes", () => ({ addMembers: jest.fn() }));

const ZITTING = "http://ex.org/zitting/1";
const STEMMING = "http://ex.org/stemming/1";

describe("generateFeed", () => {
  it("passes every subject to the feed, and adds the members it builds", async () => {
    const feed = {
      name: "zittingen",
      isMember: jest.fn(async (subject) => subject === `<${ZITTING}>`),
      buildMember: jest.fn(async () => []),
    };

    await generateFeed("unit-1", feed, new Set([ZITTING, STEMMING]));

    expect(feed.isMember.mock.calls.map(([subject]) => subject)).toEqual([
      `<${ZITTING}>`,
      `<${STEMMING}>`,
    ]);
    expect(feed.buildMember).toHaveBeenCalledTimes(1);
    expect(feed.buildMember.mock.calls[0][0]).toBe(`<${ZITTING}>`);
    expect(addMembers).toHaveBeenCalledTimes(1);
    const [unit, calledFeed, stores] = addMembers.mock.calls[0];
    expect([unit, calledFeed, [...stores.keys()]]).toEqual(["unit-1", feed, [ZITTING]]);
  });

  it("adds nothing when no subject is a member", async () => {
    const feed = { name: "besluiten", isMember: async () => false, buildMember: jest.fn() };

    await generateFeed("unit-1", feed, new Set([STEMMING]));

    expect(feed.buildMember).not.toHaveBeenCalled();
    expect(addMembers).not.toHaveBeenCalled();
  });
});
