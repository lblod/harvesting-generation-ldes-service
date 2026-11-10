import { Store, namedNode } from 'oxigraph';
import { SOURCE_GRAPH } from '../constants';

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RDF_LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

let store = new Store();

export function load(ttl) {
  store = new Store();
  store.load(ttl, {
    format: 'text/turtle',
    to_graph_name: namedNode(SOURCE_GRAPH),
  });
}

export async function querySudo(query) {
  const bindings = store.query(query).map((result) => toBindings(toRow(result)));
  return { results: { bindings } };
}

export async function updateSudo() {}

function toRow(result) {
  if (result.subject) {
    return { s: result.subject, p: result.predicate, o: result.object };
  }
  return Object.fromEntries(result);
}

function toBindings(row) {
  const bindings = {};
  for (const variable in row) bindings[variable] = toBinding(row[variable]);
  return bindings;
}

function toBinding(term) {
  if (term.termType === 'NamedNode') return { type: 'uri', value: term.value };
  if (term.termType === 'BlankNode') return { type: 'bnode', value: term.value };
  if (term.language) {
    return { type: 'literal', value: term.value, 'xml:lang': term.language };
  }
  if ([XSD_STRING, RDF_LANG_STRING].includes(term.datatype.value)) {
    return { type: 'literal', value: term.value };
  }
  return { type: 'literal', value: term.value, datatype: term.datatype.value };
}
