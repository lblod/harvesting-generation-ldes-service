import { readFileSync } from "fs";
import { join } from "path";
import { Parser, Store, DataFactory } from "n3";
import { SHAPES_DIR } from "../constants";
const { namedNode } = DataFactory;

const SH = (name) => namedNode(`http://www.w3.org/ns/shacl#${name}`);
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/**
 * Reads the member shape (the NodeShape targeting `rootClass`) from a SHACL
 * file. Returns the IRI of the shape and one entry for the root and each
 * nested shape (sh:node) of the member:
 *   { steps, predicates }
 * `steps` is the path from the root to the nodes of that shape, `predicates`
 * the properties we keep for them (shapes are closed).
 */
export function loadShape(file, rootClass) {
  const store = new Store(
    new Parser().parse(readFileSync(join(SHAPES_DIR, file), "utf-8")),
  );
  const [root] = store.getSubjects(SH("targetClass"), namedNode(rootClass), null);
  if (!root) throw new Error(`No shape targeting <${rootClass}> in ${file}`);

  const paths = [];
  const walk = (node, steps) => {
    const predicates = new Set([RDF_TYPE]);
    paths.push({ steps, predicates });
    for (const property of store.getObjects(node, SH("property"), null)) {
      const [path] = store.getObjects(property, SH("path"), null);
      const [nested] = store.getObjects(property, SH("node"), null);
      if (!path) continue;
      const inverse = path.termType !== "NamedNode";
      const [predicate] = inverse
        ? store.getObjects(path, SH("inversePath"), null)
        : [path];
      if (!predicate) continue;
      // for an inverse path the triple is stored on the nested resource
      if (!inverse) predicates.add(predicate.value);
      if (nested) walk(nested, [...steps, { predicate: predicate.value, inverse }]);
    }
  };
  walk(root, []);
  return { iri: root.value, paths };
}

// SPARQL path step; `up` walks from the nested resource back to its parent.
export function pathStep({ predicate, inverse }, up = false) {
  return `${inverse !== up ? "^" : ""}<${predicate}>`;
}
