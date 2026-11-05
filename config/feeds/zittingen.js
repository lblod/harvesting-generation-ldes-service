// LDES feed of the zittingen (meetings), one member per besluit:Zitting.
// Shape: https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape (shapes/meeting-ldes.ttl)
//
// Behandelingen and stemmingen live in this feed (not in the besluiten feed):
// not every behandeling results in a besluit, and votes and aanwezigen are
// completed by the notulen, at the same moment the zitting changes.
//
// Can be overridden by mounting /config/feeds (mu-javascript-template /config
// convention, picked up on restart). `subject` and `graph` are passed as
// escaped SPARQL IRIs (<...>).

const PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX schema: <https://schema.org/>
PREFIX dossier: <https://data.omgeving.vlaanderen.be/ns/dossier#>
PREFIX adms: <http://www.w3.org/ns/adms#>
`;

// The properties of a node of the shape (the shapes are closed), for the nodes
// ?s found from the zitting by `pattern` (explicit triple patterns rather than
// property paths: Virtuoso returned nothing for an inverse path combined with
// VALUES ?p).
function properties(graph, pattern, predicates) {
  return `${PREFIXES}
CONSTRUCT { ?s ?p ?o } WHERE {
  GRAPH ${graph} {
    ${pattern}
    VALUES ?p { ${predicates.join(" ")} }
    ?s ?p ?o .
  }
}`;
}

const HARVESTER = ["mu:uuid", "prov:wasDerivedFrom"];

const ZITTING = [
  "rdf:type",
  "besluit:isGehoudenDoor",
  "besluit:geplandeStart",
  "prov:startedAtTime",
  "prov:endedAtTime",
  "prov:atLocation",
  "besluit:heeftAanwezigeBijStart",
  "besluit:heeftVoorzitter",
  "besluit:heeftSecretaris",
  "besluit:behandelt",
  "besluit:heeftNotulen",
  "besluit:heeftBesluitenlijst",
  "besluit:heeftZittingsverslag",
  ...HARVESTER,
];

const AGENDAPUNT = [
  "rdf:type",
  "dct:title",
  "dct:description",
  "besluit:geplandOpenbaar",
  // full IRI: Virtuoso does not accept a dot in a prefixed name
  "<http://data.vlaanderen.be/ns/besluit#Agendapunt.type>",
  "besluit:aangebrachtNa",
  "besluit:heeftOntwerpbesluit",
  "dct:references",
  ...HARVESTER,
];

const BEHANDELING = [
  "rdf:type",
  "dct:subject",
  "besluit:openbaar",
  "besluit:gebeurtNa",
  "besluit:heeftAanwezige",
  "besluit:heeftVoorzitter",
  "besluit:heeftSecretaris",
  "besluit:heeftUittreksel",
  "besluit:heeftStemming",
  ...HARVESTER,
];

const STEMMING = [
  "rdf:type",
  "besluit:onderwerp",
  "besluit:gevolg",
  "besluit:geheim",
  "besluit:aantalVoorstanders",
  "besluit:aantalTegenstanders",
  "besluit:aantalOnthouders",
  "besluit:heeftStemmer",
  "besluit:heeftVoorstander",
  "besluit:heeftTegenstander",
  "besluit:heeftOnthouder",
  "besluit:heeftAanwezige",
  ...HARVESTER,
];

const DOCUMENT = [
  "rdf:type",
  "dct:title",
  "prov:value",
  "dct:date",
  "schema:keywords",
  "dct:subject",
  "dossier:informatieclassificatie",
  "adms:identifier",
  "mu:uuid",
];

const behandelingen = (s) => `${s} besluit:behandelt ?agendapunt . ?behandeling dct:subject ?agendapunt .`;

const QUERIES = [
  (s, g) => properties(g, `VALUES ?s { ${s} }`, ZITTING),
  (s, g) => properties(g, `${s} besluit:behandelt ?s .`, AGENDAPUNT),
  (s, g) => properties(g, `${s} besluit:behandelt ?agendapunt . ?s dct:subject ?agendapunt .`, BEHANDELING),
  (s, g) => properties(g, `${behandelingen(s)} ?behandeling besluit:heeftStemming ?s .`, STEMMING),
  (s, g) =>
    properties(
      g,
      `{ ${s} besluit:heeftNotulen|besluit:heeftBesluitenlijst|besluit:heeftZittingsverslag ?s }
    UNION { ${behandelingen(s)} ?behandeling besluit:heeftUittreksel ?s }`,
      DOCUMENT,
    ),
];

export const shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape";

// Only the subjects that are a zitting are a member of this feed.
export async function isMember(subject, { ask, graph }) {
  return ask(`${PREFIXES}
ASK { GRAPH ${graph} { ${subject} a besluit:Zitting } }`);
}

// The member: the zitting and its nested resources, as an array of quads.
export async function buildMember(subject, { construct, graph }) {
  const quads = [];
  for (const query of QUERIES) {
    quads.push(...(await construct(query(subject, graph))));
  }
  return quads;
}
