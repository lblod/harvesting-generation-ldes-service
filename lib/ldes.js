import { DataFactory } from 'n3';
import { getConfigFromEnv, addData, Member } from '@lblod/ldes-producer';
const { namedNode } = DataFactory;

const STREAM_PREFIX = process.env.LDES_STREAM_PREFIX || process.env.BASE_URL;

export const config = getConfigFromEnv();

// Adds a new version of each member to the stream <STREAM_PREFIX><unit>/<feed>.
export async function addMembers(unit, feed, stores) {
  await addData(
    {
      ...config,
      streamPrefix: (name) => namedNode(`${STREAM_PREFIX}${unit}/${name}`),
    },
    {
      folder: `${unit}/${feed.name}`,
      members: [...stores].map(
        ([uri, store]) => new Member(namedNode(uri), store),
      ),
      shape: feed.shape,
    },
  );
}
