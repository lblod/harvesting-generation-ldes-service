import { loadShape } from "./shapes";
import { enrichBesluiten } from "./derive";

const BESLUIT = "http://data.vlaanderen.be/ns/besluit#";

// One LDES stream per feed and administrative unit. The behandelingen live in
// the zittingen feed, a besluit only links to its behandeling.
export const FEEDS = [
  {
    name: "zittingen",
    file: "meeting-ldes.ttl",
    rootClass: `http://data.vlaanderen.be/ns/besluit#Zitting`,
    shape: loadShape("meeting-ldes.ttl", `http://data.vlaanderen.be/ns/besluit#Zitting`),
  },
  {
    name: "besluiten",
    file: "decision-ldes.ttl",
    rootClass: `http://data.vlaanderen.be/ns/besluit#Besluit`,
    shape: loadShape("decision-ldes.ttl", `http://data.vlaanderen.be/ns/besluit#Besluit`),
    enrich: enrichBesluiten,
  },
];
