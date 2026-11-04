import { loadShape } from "./shapes";
import { enrichBesluiten } from "./derive";

const BESLUIT = "http://data.vlaanderen.be/ns/besluit#";

// One LDES stream per feed and administrative unit. The behandelingen live in
// the zittingen feed, a besluit only links to its behandeling.
export const FEEDS = [
  {
    name: "zittingen",
    file: "meeting-ldes.ttl",
    rootClass: `${BESLUIT}Zitting`,
    shape: loadShape("meeting-ldes.ttl", `${BESLUIT}Zitting`),
  },
  {
    name: "besluiten",
    file: "decision-ldes.ttl",
    rootClass: `${BESLUIT}Besluit`,
    shape: loadShape("decision-ldes.ttl", `${BESLUIT}Besluit`),
    enrich: enrichBesluiten,
  },
];
