import { sparqlEscapeUri } from 'mu';
import { DataFactory, Store } from 'n3';
import {
  STATUS_BUSY,
  STATUS_SUCCESS,
  STATUS_FAILED,
  DIFF_FILE_NAMES,
  REMOVED_FILE_NAME,
  BATCH_SIZE,
  RDF_TYPE,
  AS_TOMBSTONE,
  AS_FORMER_TYPE,
} from '../constants';
import {
  loadTask,
  updateTaskStatus,
  appendTaskError,
  unitName,
} from './task';
import { getFilePaths, readDiffFile } from './graph';
import { addMembers } from './ldes';
import { context, findMembers } from './feeds';
import { chunk } from './utils';

export async function run(taskUri, feeds) {
  const task = await loadTask(taskUri);
  if (!task) return;

  try {
    await updateTaskStatus(task, STATUS_BUSY);
    const unit = await unitName(task.unit);
    if (!/^[\w-]+$/.test(unit)) {
      throw new Error(`Cannot derive a stream name from unit <${task.unit}>`);
    }

    const subjects = new Set();
    const removedSubjects = new Map();
    for (const fileName of DIFF_FILE_NAMES) {
      for (const path of await getFilePaths(fileName, task)) {
        const diff = await readDiffFile(path);
        diff.subjects.forEach((subject) => subjects.add(subject));
        if (fileName === REMOVED_FILE_NAME) {
          for (const removed of diff.types) {
            if (!removedSubjects.has(removed.rdfType)) {
              removedSubjects.set(removed.rdfType, new Set());
            }
            removedSubjects.get(removed.rdfType).add(removed.subject);
          }
        }
      }
    }

    for (const feed of feeds) {
      await generateFeed(unit, feed, subjects);
      await addTombstones(
        unit,
        feed,
        removedSubjects.get(feed.rdfType) || new Set(),
      );
    }

    await updateTaskStatus(task, STATUS_SUCCESS);
  } catch (e) {
    console.error(e);
    await appendTaskError(task, e.message);
    await updateTaskStatus(task, STATUS_FAILED);
  }
}

export async function generateFeed(unit, feed, subjects) {
  for (const batch of chunk([...subjects], BATCH_SIZE)) {
    const members = await findMembers(batch, feed, context);
    const stores = new Map();
    for (const uri of members) {
      const quads = await feed.buildMember(sparqlEscapeUri(uri), context);
      if (!quads) {
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

export async function addTombstones(unit, feed, removedSubjects) {
  for (const batch of chunk([...removedSubjects], BATCH_SIZE)) {
    const stores = new Map();
    for (const subject of batch) {
      stores.set(subject, tombstone(subject, feed.rdfType));
    }
    await addMembers(unit, feed, stores);
  }
}

function tombstone(subject, formerType) {
  const member = DataFactory.namedNode(subject);
  return new Store([
    DataFactory.quad(
      member,
      DataFactory.namedNode(RDF_TYPE),
      DataFactory.namedNode(AS_TOMBSTONE),
    ),
    DataFactory.quad(
      member,
      DataFactory.namedNode(AS_FORMER_TYPE),
      DataFactory.namedNode(formerType),
    ),
  ]);
}
