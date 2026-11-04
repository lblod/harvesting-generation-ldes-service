import { sparqlEscapeUri } from "mu";
import { querySudo as query } from "@lblod/mu-auth-sudo";
import { DataFactory } from "n3";
import {
  PREFIXES,
  SOURCE_GRAPH,
  HIGH_LOAD_DATABASE_ENDPOINT,
} from "../constants";
import { chunk, valuesClause } from "./utils";
const { namedNode, literal } = DataFactory;

const RDF_TYPE = namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
const ELI = (name) => namedNode(`http://data.europa.eu/eli/ontology#${name}`);
const BESLUIT = (name) => namedNode(`http://data.vlaanderen.be/ns/besluit#${name}`);
const LANGUAGE_NLD = namedNode(
  "http://publications.europa.eu/resource/authority/language/NLD",
);
const XSD_DATE = namedNode("http://www.w3.org/2001/XMLSchema#date");

/**
 * Fills the gaps publishers leave in a besluit (stores: Map of besluit uri ->
 * N3 Store):
 *  - eli:passed_by: the bestuursorgaan (in tijd) of the zitting
 *  - eli:date_publication: the earliest date of the notulen/besluitenlijst
 *  - eli:language: NLD when missing (besluit and artikels)
 */
export async function enrichBesluiten(stores) {
  const meetings = await getMeetings([...stores.keys()]);
  for (const [uri, store] of stores) {
    const besluit = namedNode(uri);
    const meeting = meetings.get(uri);
    if (meeting) {
      const [passedBy] = store.getObjects(besluit, ELI("passed_by"), null);
      // a missing value, or the bestuursorgaan the zitting's organ is a time specialisation of
      if (!passedBy || passedBy.value === meeting.generalOrgan) {
        store.removeQuads(store.getQuads(besluit, ELI("passed_by"), null, null));
        store.addQuad(besluit, ELI("passed_by"), namedNode(meeting.organ));
      }
      if (meeting.date && !store.countQuads(besluit, ELI("date_publication"), null, null)) {
        store.addQuad(
          besluit,
          ELI("date_publication"),
          literal(meeting.date, XSD_DATE),
        );
      }
    }
    for (const type of ["Besluit", "Artikel"]) {
      for (const subject of store.getSubjects(RDF_TYPE, BESLUIT(type), null)) {
        if (!store.countQuads(subject, ELI("language"), null, null)) {
          store.addQuad(subject, ELI("language"), LANGUAGE_NLD);
        }
      }
    }
  }
}

// besluit uri -> { organ, generalOrgan, date } of the zitting it was taken in
async function getMeetings(besluiten) {
  const meetings = new Map();
  for (const uris of chunk(besluiten, 100)) {
    const result = await query(
      `
      ${PREFIXES}
      SELECT ?besluit ?organ ?generalOrgan ?date WHERE {
        GRAPH ${sparqlEscapeUri(SOURCE_GRAPH)} {
          ${valuesClause("besluit", uris)}
          ?besluit prov:wasGeneratedBy ?behandeling .
          ?behandeling dct:subject ?agendapunt .
          ?zitting besluit:behandelt ?agendapunt ;
                   besluit:isGehoudenDoor ?organ .
          OPTIONAL { ?organ mandaat:isTijdspecialisatieVan ?generalOrgan }
          OPTIONAL {
            ?zitting (besluit:heeftNotulen|besluit:heeftBesluitenlijst)/dct:date ?date
          }
        }
      }`,
      {},
      { sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT, mayRetry: true },
    );
    for (const row of result.results.bindings) {
      const uri = row.besluit.value;
      const meeting = meetings.get(uri) || { organ: row.organ.value };
      meeting.generalOrgan = row.generalOrgan?.value;
      const date = row.date?.value.slice(0, 10);
      if (date && (!meeting.date || date < meeting.date)) meeting.date = date;
      meetings.set(uri, meeting);
    }
  }
  return meetings;
}
