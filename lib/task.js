import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
} from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  TASK_TYPE,
  PREFIXES,
  STATUS_BUSY,
  STATUS_FAILED,
  ERROR_URI_PREFIX,
  TASK_GENERATING_LDES,
  ERROR_TYPE,
  HIGH_LOAD_DATABASE_ENDPOINT,
} from '../constants';

const connectionOptions = {
  sparqlEndpoint: HIGH_LOAD_DATABASE_ENDPOINT,
  mayRetry: true,
};

export async function failBusyTasks() {
  const queryStr = `
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ?task adms:status ${sparqlEscapeUri(STATUS_BUSY)} .
        ?task dct:modified ?modified.
      }
    }
    INSERT {
      GRAPH ?g {
       ?task adms:status ${sparqlEscapeUri(STATUS_FAILED)} .
       ?task dct:modified ${sparqlEscapeDateTime(new Date())}.
      }
    }
    WHERE {
      GRAPH ?g {
        ?task a ${sparqlEscapeUri(TASK_TYPE)};
              adms:status ${sparqlEscapeUri(STATUS_BUSY)};
              task:operation ${sparqlEscapeUri(TASK_GENERATING_LDES)}.
        OPTIONAL { ?task dct:modified ?modified. }
      }
    }
   `;
  try {
    await update(queryStr);
  } catch (e) {
    console.warn(
      `WARNING: failed to move busy tasks to failed status on startup.`,
      e,
    );
  }
}

export async function loadTask(subject) {
  const queryTask = `
   ${PREFIXES}
   SELECT DISTINCT ?graph ?task ?job ?unit WHERE {
    GRAPH ?graph {
      BIND(${sparqlEscapeUri(subject)} as ?task)
      ?task a ${sparqlEscapeUri(TASK_TYPE)};
            dct:isPartOf ?job;
            task:operation ${sparqlEscapeUri(TASK_GENERATING_LDES)}.
    }
    GRAPH ?jobGraph {
      ?job dct:subject ?unit.
    }
   }
   LIMIT 1
  `;
  const result = await query(queryTask, {}, connectionOptions);
  const binding = result.results.bindings[0];
  if (!binding) return null;
  return {
    graph: binding.graph.value,
    task: binding.task.value,
    job: binding.job.value,
    unit: binding.unit.value,
  };
}

export async function updateTaskStatus(task, status) {
  await update(`
    ${PREFIXES}
    DELETE {
      GRAPH ?g {
        ?subject adms:status ?status .
        ?subject dct:modified ?modified.
      }
    }
    INSERT {
      GRAPH ?g {
       ?subject adms:status ${sparqlEscapeUri(status)}.
       ?subject dct:modified ${sparqlEscapeDateTime(new Date())}.
      }
    }
    WHERE {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(task.task)} as ?subject)
        ?subject adms:status ?status .
        OPTIONAL { ?subject dct:modified ?modified. }
      }
    }
  `);
}

export async function appendTaskError(task, errorMsg) {
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
   ${PREFIXES}
   INSERT DATA {
    GRAPH ${sparqlEscapeUri(task.graph)}{
      ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)};
        mu:uuid ${sparqlEscapeString(id)};
        oslc:message ${sparqlEscapeString(errorMsg)}.
      ${sparqlEscapeUri(task.task)} task:error ${sparqlEscapeUri(uri)}.
    }
   }
  `;

  await update(queryError);
}
