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
PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX sro: <https://data.vlaanderen.be/ns/slimmeraadpleegomgeving#>
`;

const NLD = "<http://publications.europa.eu/resource/authority/language/NLD>";
// the zitting the besluit was taken in
const ZITTING = "prov:wasGeneratedBy/dct:subject/^besluit:behandelt";

// The properties of a node of the shape (the shapes are closed), found from the
// besluit along `path`.
function properties(subject, graph, path, predicates) {
  return `${PREFIXES}
CONSTRUCT { ?s ?p ?o } WHERE {
  GRAPH ${graph} {
    ${path ? `${subject} ${path} ?s .` : `VALUES ?s { ${subject} }`}
    VALUES ?p { ${predicates.join(" ")} }
    ?s ?p ?o .
  }
}`;
}

// eli:passed_by and eli:date_publication are derived below
const BESLUIT = [
  "rdf:type",
  "eli:title",
  "eli:description",
  "prov:value",
  "besluit:motivering",
  "eli:title_short",
  "eli:first_date_entry_in_force",
  "eli:date_no_longer_in_force",
  "eli:cites",
  "eli:corrects",
  "eli:consolidates",
  "eli:repeals",
  "eli:jurisdiction",
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
  "prov:wasDerivedFrom",
];

const ARTIKEL = ["rdf:type", "prov:value", "eli:number", "eli:language", "prov:wasDerivedFrom", "mu:uuid"];

// eli:passed_by: the bestuursorgaan in tijd that held the zitting, when missing or
// when it is the (general) bestuursorgaan of that organ in tijd.
function passedBy(subject, graph) {
  return `${PREFIXES}
CONSTRUCT { ${subject} eli:passed_by ?passedBy } WHERE {
  GRAPH ${graph} {
    OPTIONAL { ${subject} eli:passed_by ?given }
    OPTIONAL {
      ${subject} ${ZITTING}/besluit:isGehoudenDoor ?organ .
      OPTIONAL { ?organ mandaat:isTijdspecialisatieVan ?general }
    }
    BIND(IF(BOUND(?organ) && (!BOUND(?given) || (BOUND(?general) && sameTerm(?given, ?general))), ?organ, ?given) AS ?passedBy)
  }
}`;
}

// eli:date_publication: when missing, the earliest date of the notulen / besluitenlijst.
function datePublication(subject, graph) {
  return `${PREFIXES}
CONSTRUCT { ${subject} eli:date_publication ?date } WHERE {
  GRAPH ${graph} {
    OPTIONAL { ${subject} eli:date_publication ?given }
    OPTIONAL {
      SELECT (MIN(SUBSTR(STR(?documentDate), 1, 10)) AS ?earliest) WHERE {
        ${subject} ${ZITTING}/(besluit:heeftNotulen|besluit:heeftBesluitenlijst)/dct:date ?documentDate .
      }
    }
    BIND(COALESCE(?given, STRDT(?earliest, xsd:date)) AS ?date)
  }
}`;
}

// eli:language: NLD when missing, on the besluit and on its artikels (an existing
// language is read with the other properties).
function language(subject, graph) {
  return `${PREFIXES}
CONSTRUCT { ${subject} eli:language ${NLD} } WHERE {
  GRAPH ${graph} {
    ${subject} a besluit:Besluit .
    FILTER NOT EXISTS { ${subject} eli:language ?language }
  }
}`;
}

function artikelLanguage(subject, graph) {
  return `${PREFIXES}
CONSTRUCT { ?artikel eli:language ${NLD} } WHERE {
  GRAPH ${graph} {
    ${subject} eli:has_part ?artikel .
    FILTER NOT EXISTS { ?artikel eli:language ?language }
  }
}`;
}

const QUERIES = [
  (s, g) => properties(s, g, null, BESLUIT),
  (s, g) => properties(s, g, "eli:has_part", ARTIKEL),
  passedBy,
  datePublication,
  language,
  artikelLanguage,
];

export const shape = "https://data.lblod.info/shacl/ldes-besluit#BesluitMemberShape";

// Only the subjects that are a besluit are a member of this feed.
export async function isMember(subject, { ask, graph }) {
  return ask(`${PREFIXES}
ASK { GRAPH ${graph} { ${subject} a besluit:Besluit } }`);
}

// The member: the besluit, its artikels and the derived data, as an array of quads.
export async function buildMember(subject, { construct, graph }) {
  const quads = [];
  for (const query of QUERIES) {
    quads.push(...(await construct(query(subject, graph))));
  }
  return quads;
}
