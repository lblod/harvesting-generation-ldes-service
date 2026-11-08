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

// The nodes of the shape (the shapes are closed): how to find a node ?s from
// the zitting (explicit triple patterns rather than property paths: Virtuoso
// returned nothing for an inverse path combined with VALUES ?p), and its
// required (sh:minCount 1) and optional properties.
const behandelingen = (s) => `${s} besluit:behandelt ?agendapunt . ?behandeling dct:subject ?agendapunt .`;

const NODES = [
  {
    // zitting (root of the member)
    find: (s) => `VALUES ?s { ${s} }`,
    required: ["rdf:type", "besluit:isGehoudenDoor", "prov:wasDerivedFrom"],
    optional: [
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
      "mu:uuid",
    ],
  },
  {
    // agendapunt
    find: (s) => `${s} besluit:behandelt ?s .`,
    required: ["dct:title", "prov:wasDerivedFrom"],
    optional: [
      "rdf:type",
      "dct:description",
      "besluit:geplandOpenbaar",
      // full IRI: Virtuoso does not accept a dot in a prefixed name
      "<http://data.vlaanderen.be/ns/besluit#Agendapunt.type>",
      "besluit:aangebrachtNa",
      "besluit:heeftOntwerpbesluit",
      "dct:references",
      "mu:uuid",
    ],
  },
  {
    // behandeling
    find: (s) => `${s} besluit:behandelt ?agendapunt . ?s dct:subject ?agendapunt .`,
    required: ["dct:subject", "besluit:openbaar", "prov:wasDerivedFrom"],
    optional: [
      "rdf:type",
      "besluit:gebeurtNa",
      "besluit:heeftAanwezige",
      "besluit:heeftVoorzitter",
      "besluit:heeftSecretaris",
      "besluit:heeftUittreksel",
      "besluit:heeftStemming",
      "mu:uuid",
    ],
  },
  {
    // stemming
    find: (s) => `${behandelingen(s)} ?behandeling besluit:heeftStemming ?s .`,
    required: ["besluit:onderwerp", "besluit:gevolg", "prov:wasDerivedFrom"],
    optional: [
      "rdf:type",
      "besluit:geheim",
      "besluit:aantalVoorstanders",
      "besluit:aantalTegenstanders",
      "besluit:aantalOnthouders",
      "besluit:heeftStemmer",
      "besluit:heeftVoorstander",
      "besluit:heeftTegenstander",
      "besluit:heeftOnthouder",
      "besluit:heeftAanwezige",
      "mu:uuid",
    ],
  },
  {
    // notulen, besluitenlijst, zittingsverslag, uittreksels
    find: (s) => `{ ${s} besluit:heeftNotulen|besluit:heeftBesluitenlijst|besluit:heeftZittingsverslag ?s }
      UNION { ${behandelingen(s)} ?behandeling besluit:heeftUittreksel ?s }`,
    required: [],
    optional: [
      "rdf:type",
      "dct:title",
      "prov:value",
      "dct:date",
      "schema:keywords",
      "dct:subject",
      "dossier:informatieclassificatie",
      "adms:identifier",
      "mu:uuid",
    ],
  },
];

export const shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape";

// Only the subjects that are a zitting are a member of this feed.
export async function isMember(subject, { ask, graph }) {
  return ask(`${PREFIXES}
ASK { GRAPH ${graph} { ${subject} a besluit:Zitting } }`);
}

// The member: the zitting and its nested resources, as an array of quads, or null when
// the zitting misses one of its required properties.
export async function buildMember(subject, { build }) {
  return build(subject, { prefixes: PREFIXES, nodes: NODES });
}
