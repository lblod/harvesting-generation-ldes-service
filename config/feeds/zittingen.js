// Feed of the zittingen (meetings): one member per besluit:Zitting, with its
// agendapunten, behandelingen, stemmingen and documents.
//
// Only the public agendapunten (besluit:geplandOpenbaar true) are in a member.
// A zitting without public agendapunten is still published, without agendapunten.
//
// This folder can be mounted (/config/feeds), so no imports here: the service
// passes everything a feed needs in the context. A feed file must export
// `shape`, `getNodes()` and `isMember()`, or the service does not start.

export const shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape";

export const prefixes = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX schema: <https://schema.org/>
PREFIX dossier: <https://data.omgeving.vlaanderen.be/ns/dossier#>
PREFIX adms: <http://www.w3.org/ns/adms#>
`;

// The nodes of the shape (shapes/meeting-ldes.ttl), the zitting first.
// `find` uses plain triple patterns, Virtuoso returns nothing for an inverse
// path combined with VALUES ?p.
const NODES = [
  {
    // zitting (root of the member)
    find: (s) => `VALUES ?s { ${s} }`,
    // no rdf:type: the (closed) zitting shape has none, isMember already checks it
    required: ["besluit:isGehoudenDoor", "prov:wasDerivedFrom"],
    optional: [
      "besluit:geplandeStart",
      "prov:startedAtTime",
      "prov:endedAtTime",
      "prov:atLocation",
      "besluit:heeftAanwezigeBijStart",
      "besluit:heeftVoorzitter",
      "besluit:heeftSecretaris",
      // besluit:behandelt is read by the last node, only to the public agendapunten
      "besluit:heeftNotulen",
      "besluit:heeftBesluitenlijst",
      "besluit:heeftZittingsverslag",
      "mu:uuid",
    ],
  },
  {
    // agendapunt
    find: (s) => `${s} besluit:behandelt ?s . ?s besluit:geplandOpenbaar true .`,
    required: ["dct:title", "prov:wasDerivedFrom"],
    optional: [
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
    find: (s) => `${s} besluit:behandelt ?agendapunt . ?agendapunt besluit:geplandOpenbaar true . ?s dct:subject ?agendapunt .`,
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
  {
    // besluit:behandelt of the zitting (the root again), only to its public
    // agendapunten: find binds ?o, so `?s ?p ?o` only returns those links
    find: (s) => `VALUES ?s { ${s} } ?s besluit:behandelt ?o . ?o besluit:geplandOpenbaar true .`,
    optional: ["besluit:behandelt"],
  },
];

export function getNodes() {
  return NODES;
}

export async function isMember(subject, { ask, graph }) {
  return ask(`${prefixes}
ASK { GRAPH ${graph} { ${subject} a besluit:Zitting } }`);
}

// The behandelingen of the public agendapunten of the zitting.
function behandelingen(s) {
  return `${s} besluit:behandelt ?agendapunt . ?agendapunt besluit:geplandOpenbaar true . ?behandeling dct:subject ?agendapunt .`;
}
