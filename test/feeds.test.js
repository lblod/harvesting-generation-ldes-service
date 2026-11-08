import { querySudo } from "@lblod/mu-auth-sudo";
import { DataFactory } from "n3";
import { loadFeeds, context, createContext } from "../lib/feeds";
const { namedNode, literal, quad } = DataFactory;

const SUBJECT = "<http://ex.org/x/1>";
const GRAPH = "<http://mu.semte.ch/graphs/public>";

// collects the queries a feed sends, answering the CONSTRUCTs with the given quads in order
function fakeContext(...answers) {
  const queries = [];
  const ctx = createContext({
    graph: GRAPH,
    ask: jest.fn(async (q) => queries.push(q) && true),
    construct: jest.fn(async (q) => {
      queries.push(q);
      return answers.shift() || [];
    }),
  });
  return { ctx, queries };
}

const ex = (name) => namedNode(`http://ex.org/${name}`);
const on = (subject, ...predicates) =>
  predicates.map((p) => quad(subject, namedNode(p), literal("x")));

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const BESLUIT = "http://data.vlaanderen.be/ns/besluit#";
const PROV = "http://www.w3.org/ns/prov#";

const feed = async (name) => (await loadFeeds()).find((f) => f.name === name);

describe("loadFeeds", () => {
  it("has a feed per file in config/feeds, named after the file, with its shape", async () => {
    expect((await loadFeeds()).map(({ name, shape }) => [name, shape])).toEqual([
      ["besluiten", "https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape"],
      ["zittingen", "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape"],
    ]);
  });
});

describe("zittingen", () => {
  const required = on(ex("x/1"), `${BESLUIT}isGehoudenDoor`, `${PROV}wasDerivedFrom`);

  it("only has zittingen as members", async () => {
    const { ctx, queries } = fakeContext();

    expect(await (await feed("zittingen")).isMember(SUBJECT, ctx)).toBe(true);
    expect(queries[0]).toContain(`ASK { GRAPH ${GRAPH} { ${SUBJECT} a besluit:Zitting } }`);
  });

  it("reads the required, then the optional properties of all nodes, in two queries", async () => {
    const optional = on(ex("stemming/1"), `${BESLUIT}aantalVoorstanders`);
    const { ctx, queries } = fakeContext(required, optional);

    const quads = await (await feed("zittingen")).buildMember(SUBJECT, ctx);

    expect(quads).toEqual([...required, ...optional]);
    expect(queries).toHaveLength(2);
    queries.forEach((q) => expect(q).toContain(`GRAPH ${GRAPH}`));
    const [req, opt] = queries;
    expect(req).toContain(`VALUES ?s { ${SUBJECT} }`);
    expect(req).toContain("besluit:isGehoudenDoor");
    expect(req).toContain("besluit:gevolg");
    expect(req).not.toContain("besluit:heeftNotulen|"); // documents have no required properties
    expect(opt).toContain(`${SUBJECT} besluit:behandelt ?s .`);
    expect(opt).toContain("?behandeling dct:subject ?agendapunt . ?behandeling besluit:heeftStemming ?s .");
    expect(opt).toContain("besluit:aantalVoorstanders");
    expect(opt).toContain("besluit:heeftNotulen|besluit:heeftBesluitenlijst");
    expect(opt).toContain("?behandeling besluit:heeftUittreksel ?s");
  });

  it("only reads the zitting when it has its required properties", async () => {
    const { ctx, queries } = fakeContext(required);

    await (await feed("zittingen")).buildMember(SUBJECT, ctx);
    expect(queries[0]).toContain("FILTER (EXISTS { ?s besluit:isGehoudenDoor [] })");
    expect(queries[0]).toContain("FILTER (EXISTS { ?s prov:wasDerivedFrom [] })");
    // nested nodes are not filtered on their required properties
    expect(queries[0].match(/FILTER/g)).toHaveLength(2);
    expect(queries[0]).not.toContain("rdf:type"); // not in the zitting, agendapunt or stemming shapes
  });

  it("is not built when the zitting misses a required property (nothing comes back for it)", async () => {
    const { ctx, queries } = fakeContext(on(ex("stemming/1"), `${BESLUIT}gevolg`));

    expect(await (await feed("zittingen")).buildMember(SUBJECT, ctx)).toBeNull();
    expect(queries).toHaveLength(1);
  });
});

describe("besluiten", () => {
  const ELI = "http://data.europa.eu/eli/ontology#";
  const required = on(ex("x/1"), `${RDF}type`, `${PROV}wasDerivedFrom`);

  it("only has besluiten as members", async () => {
    const { ctx, queries } = fakeContext();

    await (await feed("besluiten")).isMember(SUBJECT, ctx);
    expect(queries[0]).toContain(`${SUBJECT} a besluit:Besluit`);
  });

  it("builds the member from the besluit and its artikels, in two queries", async () => {
    const { ctx, queries } = fakeContext(required);

    expect(await (await feed("besluiten")).buildMember(SUBJECT, ctx)).toEqual(required);
    expect(queries).toHaveLength(2);
    const [req, opt] = queries;
    expect(req).toContain(`${SUBJECT} eli:has_part ?s .`);
    // the behandeling is only linked, it lives in the zittingen feed
    expect(opt).toContain("prov:wasGeneratedBy");
    expect(opt).not.toContain("besluit:heeftStemming");
    expect(opt).toContain("eli:passed_by");
    expect(opt).toContain("eli:date_publication");
  });

  it("needs a title or a description (sh:or), but reads both as optional", async () => {
    const { ctx, queries } = fakeContext(required);

    await (await feed("besluiten")).buildMember(SUBJECT, ctx);
    const [req, opt] = queries;
    expect(req).toContain("FILTER (EXISTS { ?s eli:title [] } || EXISTS { ?s eli:description [] })");
    expect(req).toContain("VALUES ?p { rdf:type prov:wasDerivedFrom }");
    expect(opt).toContain("eli:title eli:description");
    // prov:value (the extracted text) is optional on the besluit, required on an artikel
    expect(req).not.toContain("FILTER (EXISTS { ?s prov:value [] })");
    expect(opt).toMatch(/VALUES \?p \{[^}]*prov:value/);
  });

  it("is not built when the besluit misses a required property, even if an artikel has it", async () => {
    const { ctx } = fakeContext(on(ex("artikel/1"), `${PROV}value`));

    expect(await (await feed("besluiten")).buildMember(SUBJECT, ctx)).toBeNull();
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
