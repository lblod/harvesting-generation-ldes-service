import { sparqlEscapeUri } from 'mu';
import { DataFactory } from 'n3';
const { namedNode, literal, blankNode } = DataFactory;

export function toTerm(binding) {
  if (binding.type === 'uri') return namedNode(binding.value);
  if (binding.type === 'bnode') return blankNode(binding.value);
  return literal(
    binding.value,
    binding['xml:lang'] ||
      (binding.datatype ? namedNode(binding.datatype) : undefined),
  );
}

export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function valuesClause(variable, uris) {
  return `VALUES ?${variable} { ${uris.map((uri) => sparqlEscapeUri(uri)).join(' ')} }`;
}
