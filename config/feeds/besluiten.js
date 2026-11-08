// LDES feed of the besluiten (decisions), one member per besluit:Besluit.
// Shape: https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape (shapes/decision-ldes.ttl)
//
// A besluit only links to its behandeling with prov:wasGeneratedBy, the
// behandelingen and stemmingen live in the zittingen feed. Consumers that want a
// decision with its votes join both feeds on the behandeling IRI.
//
// Can be overridden by mounting /config/feeds (mu-javascript-template /config
// convention, picked up on restart). `subject` and `graph` are passed as
// escaped SPARQL IRIs (<...>).

const PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX sro: <https://data.vlaanderen.be/ns/slimmeraadpleegomgeving#>
`;

// The nodes of the shape (the shapes are closed): how to find a node ?s from
// the besluit, its required (sh:minCount 1) and optional properties, and its
// sh:or constraints: each array in `or` needs at least one of its properties.
const NODES = [
  {
    // besluit (root of the member)
    find: (s) => `VALUES ?s { ${s} }`,
    required: ["rdf:type",  "prov:wasDerivedFrom"],
    // eli:title and eli:description are optional (sh:maxCount 1), but the
    // shape's sh:or needs at least one of them
    or: [["eli:title", "eli:description"]],
    optional: [
      "eli:title",
      "eli:description",
      "besluit:motivering",
      "prov:value",
      "eli:title_short",
      "eli:date_publication",
      "eli:first_date_entry_in_force",
      "eli:date_no_longer_in_force",
      "eli:cites",
      "eli:corrects",
      "eli:consolidates",
      "eli:repeals",
      "eli:jurisdiction",
      "eli:passed_by",
      "eli:changes",
      "eli:related_to",
      "eli:type_document",
      "prov:wasGeneratedBy",
      "sro:bekrachtigt",
      "dct:subject",
      "prov:atLocation",
      "eli:has_part",
      "eli:language",
      "mu:uuid",
    ],
  },
  {
    // artikel
    find: (s) => `${s} eli:has_part ?s .`,
    required: ["prov:value", "prov:wasDerivedFrom"],
    optional: ["rdf:type", "eli:number", "eli:language", "mu:uuid"],
  },
];

export const shape = "https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape";

// Only the subjects that are a besluit are a member of this feed.
export async function isMember(subject, { ask, graph }) {
  return ask(`${PREFIXES}
ASK { GRAPH ${graph} { ${subject} a besluit:Besluit } }`);
}

// The member: the besluit and its artikels, as an array of quads, or null when
// the besluit misses one of its required properties.
export async function buildMember(subject, { build }) {
  return build(subject, { prefixes: PREFIXES, nodes: NODES });
}
