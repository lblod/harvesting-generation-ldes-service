import { readFile } from "fs/promises";
import { querySudo } from "@lblod/mu-auth-sudo";
import { FEEDS } from "../lib/feeds";
import { findRoots, fetchMembers } from "../lib/members";
import { expectSameTurtle, storeToTurtle } from "./helpers";

const B = "http://data.vlaanderen.be/ns/besluit#";
const DCT = "http://purl.org/dc/terms/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const [zittingen] = FEEDS;

const uri = (value) => ({ type: "uri", value });
const literal = (value, extra = {}) => ({ type: "literal", value, ...extra });
const answer = (bindings) => ({ results: { bindings } });

describe("findRoots", () => {
  it("looks for the zittingen above the resources, along the paths of the shape", async () => {
    querySudo.mockResolvedValue(answer([{ root: uri("http://ex.org/zitting/1") }]));

    const roots = await findRoots(["http://ex.org/stemming/1"], zittingen);

    expect(roots).toEqual(["http://ex.org/zitting/1"]);
    const [query] = querySudo.mock.calls[0];
    expect(query).toContain("VALUES ?node { <http://ex.org/stemming/1> }");
    expect(query).toContain(`?root a <${B}Zitting>`);
    // stemming <- behandeling -> agendapunt <- zitting
    expect(query).toContain(`(^<${B}heeftStemming>/<${DCT}subject>/^<${B}behandelt>)`);
    expect(query).toContain(`(^<${B}heeftNotulen>)`);
  });

  it("asks for the resources in chunks and returns each root once", async () => {
    querySudo.mockResolvedValue(answer([{ root: uri("http://ex.org/zitting/1") }]));
    const nodes = Array.from({ length: 250 }, (_, i) => `http://ex.org/agendapunt/${i}`);

    const roots = await findRoots(nodes, zittingen);

    expect(querySudo).toHaveBeenCalledTimes(3);
    expect(roots).toEqual(["http://ex.org/zitting/1"]);
  });
});

describe("fetchMembers", () => {
  it("reads one query per shape node, and puts the triples in the store of the root", async () => {
    const root = "http://ex.org/zitting/1";
    const row = (s, p, o) => ({ root: uri(root), s: uri(s), p: uri(p), o });
    const answers = [
      [
        "BIND(?root AS ?s)",
        [
          row(root, RDF_TYPE, uri(`${B}Zitting`)),
          row(root, `${B}isGehoudenDoor`, uri("http://ex.org/orgaan/1")),
        ],
      ],
      [
        `?root <${B}behandelt> ?s .`,
        [
          {
            root: uri(root),
            s: uri("http://ex.org/agendapunt/1"),
            p: uri(`${DCT}title`),
            o: literal("Budget", { "xml:lang": "nl" }),
          },
        ],
      ],
      [
        `?root <${B}behandelt>/^<${DCT}subject>/<${B}heeftStemming> ?s .`,
        [
          {
            root: uri(root),
            s: uri("http://ex.org/stemming/1"),
            p: uri(`${B}aantalVoorstanders`),
            o: literal("5", { datatype: "http://www.w3.org/2001/XMLSchema#integer" }),
          },
        ],
      ],
    ];
    querySudo.mockImplementation(async (query) => {
      const found = answers.find(([needle]) => query.includes(needle));
      return answer(found ? found[1] : []);
    });

    const stores = await fetchMembers([root], zittingen.shape);

    expect(querySudo).toHaveBeenCalledTimes(zittingen.shape.paths.length);
    for (const [query] of querySudo.mock.calls) {
      expect(query).toContain(`VALUES ?root { <${root}> }`);
    }
    expectSameTurtle(
      await storeToTurtle(stores.get(root)),
      await readFile("test/examples/members/expected.ttl", "utf-8"),
    );
  });
});
