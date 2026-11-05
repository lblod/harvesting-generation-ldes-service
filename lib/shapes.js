import { readFileSync } from "fs";
import { join } from "path";
import { Parser, Store, DataFactory } from "n3";
import { SHAPES_DIR } from "../constants";
const { namedNode } = DataFactory;

const SH = (name) => namedNode(`http://www.w3.org/ns/shacl#${name}`);
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/**
 * Reads the member shape (the NodeShape targeting `rootClass`) from a SHACL
 * file. The result is a tree:
 *   { iri, predicates: Set<string>, nested: [{ predicate, inverse, shape }] }
 * `predicates` are the properties we keep for a node of that shape (shapes are
 * closed), `nested` are the paths we follow to find the nested resources
 * (sh:node) that belong to the member.
 */
export function loadShape(file, rootClass) {
  const store = new Store(
    new Parser().parse(readFileSync(join(SHAPES_DIR, file), "utf-8")),
  );
  const [root] = store.getSubjects(SH("targetClass"), namedNode(rootClass), null);
  if (!root) throw new Error(`No shape targeting <${rootClass}> in ${file}`);

  const shapes = new Map();
  const build = (node) => {
    if (shapes.has(node.value)) return shapes.get(node.value);
    const shape = { iri: node.value, predicates: new Set([RDF_TYPE]), nested: [] };
    shapes.set(node.value, shape);

    for (const property of store.getObjects(node, SH("property"), null)) {
      const [path] = store.getObjects(property, SH("path"), null);
      const [nested] = store.getObjects(property, SH("node"), null);
      if (!path) continue;
      const inverse = path.termType !== "NamedNode";
      const [predicateTerm] = inverse
        ? store.getObjects(path, SH("inversePath"), null)
        : [path];
      if (!predicateTerm) continue;
      // for an inverse path the triple is stored on the nested resource
      if (!inverse) shape.predicates.add(predicateTerm.value);
      if (nested) {
        shape.nested.push({
          predicate: predicateTerm.value,
          inverse,
          shape: build(nested),
        });
      }
    }
    return shape;
  };
  return build(root);
}

// SPARQL path step; `up` walks from the nested resource back to its parent.
export function pathStep({ predicate, inverse }, up = false) {
  return `${inverse !== up ? "^" : ""}<${predicate}>`;
}

// Property path from any nested resource back to the root of the member
// (alternatives, one for each nested shape in the tree).
export function upwardPath(shape) {
  const alternatives = [];
  const walk = (current, steps) => {
    for (const step of current.nested) {
      const path = [pathStep(step, true), ...steps];
      alternatives.push(`(${path.join("/")})`);
      walk(step.shape, path);
    }
  };
  walk(shape, []);
  return alternatives.join("|");
}
