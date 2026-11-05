import { loadShape, pathStep } from "../lib/shapes";

const B = "http://data.vlaanderen.be/ns/besluit#";
const DCT = "http://purl.org/dc/terms/";
const ELI = "http://data.europa.eu/eli/ontology#";

const stepsOf = (shape) =>
  shape.paths.map(({ steps }) => steps.map((step) => pathStep(step)).join("/")).sort();

describe("loadShape", () => {
  it("finds the nested shapes of a zitting, with the path to reach them", () => {
    const shape = loadShape("meeting-ldes.ttl", `${B}Zitting`);

    expect(shape.iri).toBe("https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape");
    expect(stepsOf(shape)).toEqual(
      [
        "", // the zitting
        `<${B}behandelt>`, // agendapunt
        `<${B}behandelt>/^<${DCT}subject>`, // behandeling
        `<${B}behandelt>/^<${DCT}subject>/<${B}heeftStemming>`,
        `<${B}behandelt>/^<${DCT}subject>/<${B}heeftUittreksel>`,
        `<${B}heeftBesluitenlijst>`,
        `<${B}heeftNotulen>`,
        `<${B}heeftZittingsverslag>`,
      ].sort(),
    );
  });

  it("keeps the properties of the shape, for the node the triple is stored on", () => {
    const shape = loadShape("meeting-ldes.ttl", `${B}Zitting`);
    const predicatesAt = (path) =>
      shape.paths.find(({ steps }) => steps.map((s) => pathStep(s)).join("/") === path)
        .predicates;

    expect(predicatesAt("")).toContain(`${B}isGehoudenDoor`);
    expect(predicatesAt("")).toContain("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
    // behandeling dct:subject agendapunt: the triple is on the behandeling
    expect(predicatesAt(`<${B}behandelt>`)).not.toContain(`${DCT}subject`);
    expect(predicatesAt(`<${B}behandelt>/^<${DCT}subject>`)).toContain(`${DCT}subject`);
    expect(predicatesAt(`<${B}behandelt>/^<${DCT}subject>/<${B}heeftStemming>`)).toContain(
      `${B}gevolg`,
    );
  });

  it("finds the artikels of a besluit", () => {
    const shape = loadShape("decision-ldes.ttl", `${B}Besluit`);

    expect(shape.iri).toBe("https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape");
    expect(stepsOf(shape)).toEqual(["", `<${ELI}has_part>`]);
  });

  it("fails when no shape targets the class", () => {
    expect(() => loadShape("decision-ldes.ttl", `${B}Zitting`)).toThrow();
  });
});
