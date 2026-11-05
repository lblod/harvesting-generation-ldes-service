import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { expectSameTurtle, turtleToStore } from "./helpers";

let dataFolder;

// the config of the library is read from the env on import, so set it before the first import
beforeAll(async () => {
  dataFolder = await mkdtemp(join(tmpdir(), "ldes-"));
  process.env.DATA_FOLDER = dataFolder;
});

afterAll(async () => {
  delete process.env.DATA_FOLDER;
  await rm(dataFolder, { recursive: true, force: true });
});

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-01-01T00:00:00.000Z"),
    // only fake Date
    doNotFake: [
      "hrtime", "nextTick", "performance", "queueMicrotask", "setImmediate", "clearImmediate",
      "setInterval", "clearInterval", "setTimeout", "clearTimeout",
    ],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// The version uris are random and the view is relative to the page.
const normalize = (page, stream) => {
  const versions = new Map();
  return page
    .replace(/versioned\/[0-9a-f-]{36}/g, (version) => {
      if (!versions.has(version)) versions.set(version, `versioned/${versions.size + 1}`);
      return versions.get(version);
    })
    .replaceAll("<./", `<${stream}/`);
};

async function addZitting(unit, feedName, ttlFile) {
  const { addMembers } = await import("../lib/ldes");
  const { loadFeeds } = await import("../lib/feeds");
  const feed = loadFeeds().find(({ name }) => name === feedName);
  const store = turtleToStore(await readFile(ttlFile, "utf-8"));
  await addMembers(unit, feed, new Map([["http://ex.org/zitting/1", store]]));
}

describe("addMembers", () => {
  it("adds the zitting with its nested resources as one member, with the shape", async () => {
    await addZitting("unit-1", "zittingen", "test/examples/ldes/zitting.ttl");

    const page = await readFile(join(dataFolder, "unit-1/zittingen/1.ttl"), "utf-8");

    expectSameTurtle(
      normalize(page, "http://example.org/ldes/unit-1/zittingen"),
      await readFile("test/examples/ldes/zittingen-page-1.ttl", "utf-8"),
    );
  });

  it("has a stream per unit and feed", async () => {
    await addZitting("unit-2", "besluiten", "test/examples/ldes/zitting.ttl");

    const page = await readFile(join(dataFolder, "unit-2/besluiten/1.ttl"), "utf-8");

    expect(page).toContain("<http://example.org/ldes/unit-2/besluiten>");
    expect(page).toContain(
      "<https://w3id.org/tree#shape> <https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape>",
    );
  });
});
