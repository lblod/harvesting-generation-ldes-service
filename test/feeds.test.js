import { querySudo } from "@lblod/mu-auth-sudo";
import { loadFeeds, context } from "../lib/feeds";

const SUBJECT = "<http://ex.org/x/1>";
const GRAPH = "<http://mu.semte.ch/graphs/public>";

// collects the queries a feed sends, answering every CONSTRUCT with one quad
function fakeContext() {
  const queries = [];
  const ctx = {
    graph: GRAPH,
    ask: jest.fn(async (q) => queries.push(q) && true),
    construct: jest.fn(async (q) => {
      queries.push(q);
      return [`quad ${queries.length}`];
    }),
  };
  return { ctx, queries };
}

const feed = (name) => loadFeeds().find((f) => f.name === name);

describe("loadFeeds", () => {
  it("has a feed per file in FEEDS_DIR, named after the file, with its shape", () => {
    expect(loadFeeds().map(({ name, shape }) => [name, shape])).toEqual([
      ["besluiten", "https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape"],
      ["zittingen", "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape"],
    ]);
  });
});

describe("zittingen", () => {
  it("only has zittingen as members", async () => {
    const { ctx, queries } = fakeContext();

    expect(await feed("zittingen").isMember(SUBJECT, ctx)).toBe(true);
    expect(queries[0]).toContain(`ASK { GRAPH ${GRAPH} { ${SUBJECT} a besluit:Zitting } }`);
  });

  it("builds the member from the zitting, agendapunten, behandelingen, stemmingen and documents", async () => {
    const { ctx, queries } = fakeContext();

    const quads = await feed("zittingen").buildMember(SUBJECT, ctx);

    expect(quads).toEqual(queries.map((_, i) => `quad ${i + 1}`));
    expect(queries).toHaveLength(5);
    queries.forEach((q) => expect(q).toContain(`GRAPH ${GRAPH}`));
    expect(queries[0]).toContain(`VALUES ?s { ${SUBJECT} }`);
    expect(queries[0]).toContain("besluit:isGehoudenDoor");
    expect(queries[1]).toContain(`${SUBJECT} besluit:behandelt ?s .`);
    expect(queries[2]).toContain(`${SUBJECT} besluit:behandelt/^dct:subject ?s .`);
    expect(queries[3]).toContain(`${SUBJECT} besluit:behandelt/^dct:subject/besluit:heeftStemming ?s .`);
    expect(queries[3]).toContain("besluit:aantalVoorstanders");
    expect(queries[4]).toContain("besluit:heeftNotulen|besluit:heeftBesluitenlijst");
    expect(queries[4]).toContain("besluit:heeftUittreksel");
  });
});

describe("besluiten", () => {
  it("only has besluiten as members", async () => {
    const { ctx, queries } = fakeContext();

    await feed("besluiten").isMember(SUBJECT, ctx);
    expect(queries[0]).toContain(`${SUBJECT} a besluit:Besluit`);
  });

  it("builds the member from the besluit and its artikels, with the derived data", async () => {
    const { ctx, queries } = fakeContext();

    await feed("besluiten").buildMember(SUBJECT, ctx);

    expect(queries).toHaveLength(5);
    // the behandeling is only linked, it lives in the zittingen feed
    expect(queries[0]).toContain("prov:wasGeneratedBy");
    expect(queries[0]).not.toContain("besluit:heeftStemming");
    expect(queries[1]).toContain(`${SUBJECT} eli:has_part ?s .`);
    expect(queries[2]).toContain(`CONSTRUCT { ${SUBJECT} eli:passed_by ?passedBy }`);
    expect(queries[2]).toContain("mandaat:isTijdspecialisatieVan");
    expect(queries[3]).toContain(`CONSTRUCT { ${SUBJECT} eli:date_publication ?date }`);
    expect(queries[3]).toContain("MIN(");
    expect(queries[4]).toContain("language/NLD");
  });

  it("does not read the derived properties as is", async () => {
    const { ctx, queries } = fakeContext();

    await feed("besluiten").buildMember(SUBJECT, ctx);

    const [values] = queries[0].match(/VALUES \?p \{[^}]*\}/);
    expect(values).not.toMatch(/eli:passed_by|eli:date_publication|eli:language/);
  });
});

describe("context", () => {
  it("turns the ?s ?p ?o bindings of a CONSTRUCT into quads", async () => {
    querySudo.mockResolvedValue({
      results: {
        bindings: [
          {
            s: { type: "uri", value: "http://ex.org/s" },
            p: { type: "uri", value: "http://ex.org/p" },
            o: { type: "literal", value: "o", "xml:lang": "nl" },
          },
        ],
      },
    });

    const [quad] = await context.construct("CONSTRUCT ...");

    expect(quad.subject.value).toBe("http://ex.org/s");
    expect(quad.predicate.value).toBe("http://ex.org/p");
    expect(quad.object.language).toBe("nl");
  });

  it("answers an ASK with a boolean", async () => {
    querySudo.mockResolvedValue({ head: {}, boolean: false });

    expect(await context.ask("ASK ...")).toBe(false);
  });
});
