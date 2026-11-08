/**
 * A feed: one LDES stream per unit, <BASE_URL><unit>/<name>.
 *
 * A feed file in config/feeds default-exports an instance of a subclass of Feed:
 *
 *   class Zittingen extends Feed {
 *     shape = "https://data.lblod.info/shacl/ldes-zitting#ZittingMemberShape";
 *     prefixes = PREFIXES;
 *     nodes = NODES;
 *     async isMember(subject, { ask, graph }) { ... }
 *   }
 *   export default new Zittingen();
 *
 * - `shape` (required): the tree:shape of the stream
 * - `prefixes`: the PREFIX declarations used in `nodes` and in the queries of the feed
 * - `nodes`: the nodes of the shape, the root first, each
 *   `{ find, required, optional, or }`:
 *     - find(subject): the triple patterns that bind ?s to this node, from the root
 *     - required: the properties with sh:minCount 1
 *     - optional: the other properties of the shape
 *     - or (root only): sh:or groups, each an array of properties of which
 *       the root needs at least one. They are only checked, list them in
 *       `required` or `optional` as their own sh:minCount says.
 * - `isMember(subject, context)` (required): whether the subject is a member of the feed
 * - `buildMember(subject, context)`: the quads of the member, or null to skip it.
 *   By default it builds the member from `nodes`; override it for anything the
 *   nodes cannot express.
 *
 * `subject` is an escaped SPARQL IRI (<...>). The context gives `ask`,
 * `construct`, `build` and `graph` (see createContext in lib/feeds.js).
 * `name` is set when the feeds are loaded, from the name of the file.
 */
export class Feed {
  name;
  shape;
  prefixes = "";
  nodes = [];

  // eslint-disable-next-line no-unused-vars
  async isMember(subject, context) {
    throw new Error(`${this.constructor.name} must implement isMember(subject, context)`);
  }

  async buildMember(subject, { build }) {
    return build(subject, { prefixes: this.prefixes, nodes: this.nodes });
  }
}
