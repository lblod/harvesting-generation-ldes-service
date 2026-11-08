import { sparqlEscapeUri } from 'mu';
import { Store } from 'n3';
import {
  STATUS_BUSY,
  STATUS_SUCCESS,
  STATUS_FAILED,
  DIFF_FILE_NAMES,
  BATCH_SIZE,
} from '../constants';
import { loadTask, updateTaskStatus, appendTaskError } from './task';
import { getFilePaths, getSubjectsInFile } from './graph';
import { addMembers } from './ldes';
import { context, findMembers } from './feeds';
import { chunk } from './utils';

export async function run(taskUri, feeds) {
  const task = await loadTask(taskUri);
  if (!task) return;

  try {
    await updateTaskStatus(task, STATUS_BUSY);
    const unit = task.unit.split('/').pop();
    if (!/^[\w-]+$/.test(unit)) {
      throw new Error(`Cannot derive a stream name from unit <${task.unit}>`);
    }

    const subjects = new Set();
    for (const fileName of DIFF_FILE_NAMES) {
      for (const path of await getFilePaths(fileName, task)) {
        (await getSubjectsInFile(path)).forEach((subject) =>
          subjects.add(subject),
        );
      }
    }

    for (const feed of feeds) {
      await generateFeed(unit, feed, subjects);
    }

    await updateTaskStatus(task, STATUS_SUCCESS);
  } catch (e) {
    console.error(e);
    await appendTaskError(task, e.message);
    await updateTaskStatus(task, STATUS_FAILED);
  }
}

// Adds a new version to the feed for every subject that is a member of it.
export async function generateFeed(unit, feed, subjects) {
  for (const batch of chunk([...subjects], BATCH_SIZE)) {
    const members = await findMembers(batch, feed, context);
    const stores = new Map();
    for (const uri of members) {
      const quads = await feed.buildMember(sparqlEscapeUri(uri), context);
      if (!quads) {
        // FIXME: if the doc cannot be build with required properties based on the shape, we mark the subject as a tombstone
        console.warn(
          `<${uri}> misses required properties, not added to ${unit}/${feed.name}`,
        );
        continue;
      }
      stores.set(uri, new Store(quads));
    }
    if (stores.size) await addMembers(unit, feed, stores);
  }
}
