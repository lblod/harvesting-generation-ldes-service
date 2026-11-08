export const shape =
  'https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape';

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

export const memberPattern = '?s a besluit:Zitting .';

const NODES = [
  {
    find: (s) => `VALUES ?s { ${s} }`,
    required: ['besluit:isGehoudenDoor', 'prov:wasDerivedFrom'],
    optional: [
      'besluit:geplandeStart',
      'prov:startedAtTime',
      'prov:endedAtTime',
      'prov:atLocation',
      'besluit:heeftAanwezigeBijStart',
      'besluit:heeftVoorzitter',
      'besluit:heeftSecretaris',
      'besluit:heeftNotulen',
      'besluit:heeftBesluitenlijst',
      'besluit:heeftZittingsverslag',
      'mu:uuid',
    ],
  },
  {
    // agendapunt
    find: (s) =>
      `${s} besluit:behandelt ?s . ?s besluit:geplandOpenbaar true .`,
    required: ['dct:title', 'prov:wasDerivedFrom'],
    optional: [
      'dct:description',
      'besluit:geplandOpenbaar',
      // Virtuoso doesn't accept a dot in a prefixed name
      '<http://data.vlaanderen.be/ns/besluit#Agendapunt.type>',
      'besluit:aangebrachtNa',
      'besluit:heeftOntwerpbesluit',
      'dct:references',
      'mu:uuid',
    ],
  },
  {
    // behandeling
    find: (s) => `${publicAgendapunten(s)} ?s dct:subject ?agendapunt .`,
    required: ['dct:subject', 'besluit:openbaar', 'prov:wasDerivedFrom'],
    optional: [
      'rdf:type',
      'besluit:gebeurtNa',
      'besluit:heeftAanwezige',
      'besluit:heeftVoorzitter',
      'besluit:heeftSecretaris',
      'besluit:heeftUittreksel',
      'besluit:heeftStemming',
      'mu:uuid',
    ],
  },
  {
    // stemming
    find: (s) => `${behandelingen(s)} ?behandeling besluit:heeftStemming ?s .`,
    required: ['besluit:onderwerp', 'besluit:gevolg', 'prov:wasDerivedFrom'],
    optional: [
      'besluit:geheim',
      'besluit:aantalVoorstanders',
      'besluit:aantalTegenstanders',
      'besluit:aantalOnthouders',
      'besluit:heeftStemmer',
      'besluit:heeftVoorstander',
      'besluit:heeftTegenstander',
      'besluit:heeftOnthouder',
      'besluit:heeftAanwezige',
      'mu:uuid',
    ],
  },
  {
    // documents
    find: (
      s,
    ) => `{ ${s} besluit:heeftNotulen|besluit:heeftBesluitenlijst|besluit:heeftZittingsverslag ?s }
      UNION { ${behandelingen(s)} ?behandeling besluit:heeftUittreksel ?s }`,
    optional: [
      'rdf:type',
      'dct:title',
      'prov:value',
      'dct:date',
      'schema:keywords',
      'dct:subject',
      'dossier:informatieclassificatie',
      'adms:identifier',
      'mu:uuid',
    ],
  },
  {
    // the zitting's links to its public agendapunten only
    find: (s) =>
      `VALUES ?s { ${s} } ?s besluit:behandelt ?o . ?o besluit:geplandOpenbaar true .`,
    optional: ['besluit:behandelt'],
  },
];

export function getNodes() {
  return NODES;
}

function publicAgendapunten(zitting) {
  return `${zitting} besluit:behandelt ?agendapunt . ?agendapunt besluit:geplandOpenbaar true .`;
}

function behandelingen(zitting) {
  return `${publicAgendapunten(zitting)} ?behandeling dct:subject ?agendapunt .`;
}
