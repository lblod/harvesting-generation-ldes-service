import { Parser, Store, DataFactory } from 'n3';

const SH = 'http://www.w3.org/ns/shacl#';

  function walk(shape, chain, node, seen) {
    for (const prop of get(shape, 'property')) {
      const path = get(prop, 'path')[0];
      const inverse = path.termType === 'BlankNode' ? get(path, 'inversePath')[0] : null;
      const pred = `<${(inverse || path).value}>`;
      const v = `?v${i++}`;
      const triple = inverse ? `${v} ${pred} ${node} .` : `${node} ${pred} ${v} .`;
      const [s, o] = inverse ? [v, node] : [node, v];

      branches.push(`{ ${chain} ${triple} BIND(${s} AS ?s) BIND(${pred} AS ?p) BIND(${o} AS ?o) }`);

      for (const nested of get(prop, 'node')) {
        if (!seen.includes(nested.value)) walk(nested, `${chain} ${triple}`, v, [...seen, nested.value]);
      }
    }
  }

// Builds a paginated SELECT ?s ?p ?o that returns, for each root of the shape,
// all triples reachable through its sh:property paths (following nested sh:node shapes).
export function shapeToSelectQuery(turtle, shapeIri, { limit = 100, offset = 0 } = {}) {
  const store = new Store(new Parser().parse(turtle));
  const get = (s, p) => store.getObjects(s, DataFactory.namedNode(SH + p), null);
  const branches = [];
  let i = 0;



  walk(DataFactory.namedNode(shapeIri), '', '?root', [shapeIri]);
  const targetClass = get(DataFactory.namedNode(shapeIri), 'targetClass')[0].value;

  return `SELECT DISTINCT ?s ?p ?o WHERE {
  { SELECT ?root WHERE { ?root a <${targetClass}> } ORDER BY ?root LIMIT ${limit} OFFSET ${offset} }
  ${branches.join('\n  UNION\n  ')}
}`;
}