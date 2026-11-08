// One member per besluit, with its artikels. Only the besluiten of a public
// agendapunt of a published zitting, so they always link to a behandeling in the zittingen feed.
// No imports: this folder can be mounted.

export const shape = "https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape";

export const prefixes = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX sro: <https://data.vlaanderen.be/ns/slimmeraadpleegomgeving#>
`;

// The nodes of shapes/decision-ldes.ttl, the besluit first.
const NODES = [
  {
    // besluit
    find: (s) => `VALUES ?s { ${s} }`,
    required: ["rdf:type", "prov:wasDerivedFrom"],
    // sh:or in the shape
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

export function getNodes() {
  return NODES;
}

export async function isMember(subject, { ask, graph }) {
  return ask(`${prefixes}
ASK { GRAPH ${graph} {
  ${subject} a besluit:Besluit ; prov:wasGeneratedBy ?behandeling .
  ?behandeling dct:subject ?agendapunt .
  ?agendapunt besluit:geplandOpenbaar true .
  ?zitting besluit:behandelt ?agendapunt ; besluit:isGehoudenDoor [] ; prov:wasDerivedFrom [] .
} }`);
}
