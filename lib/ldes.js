import { DataFactory } from "n3";
import { getConfigFromEnv, addData, Member } from "@lblod/ldes-producer";
const { namedNode } = DataFactory;

// the stream of a unit is then <BASE_URL><unit>/<feed>, the url of its first page minus /1
process.env.LDES_STREAM_PREFIX ||= process.env.BASE_URL;

export const config = getConfigFromEnv();

// Adds a new version of each member (a Map of uri -> N3 Store) to the stream of the unit and feed.
export async function addMembers(unit, feed, stores) {
  await addData(config, {
    folder: `${unit}/${feed.name}`,
    members: [...stores].map(([uri, store]) => new Member(namedNode(uri), store)),
    shape: feed.shape.iri,
  });
}
