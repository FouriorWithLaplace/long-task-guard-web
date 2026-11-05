import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { EntryDetail, EntryTask } from "../../types/encyclopedia.ts";

// New or transformed fields are pending; unchanged confirmed results survive.
export function reconcileTaskSchema(task: EntryTask, detail: EntryDetail) {
  if (task.dictionaryHash === detail.dictionaryHash) return false;
  const confirmed = new Set(task.processedFields);
  const previousScope = new Set(task.scope);
  task.scope = detail.fields
    .filter(function writable(field) {
      return field.writable;
    })
    .map(function key(field) {
      return field.key;
    });
  task.processedFields = detail.fields
    .filter(function unchanged(field) {
      const result = task.results[field.key];
      return (
        field.writable &&
        previousScope.has(field.key) &&
        confirmed.has(field.key) &&
        result?.readback &&
        isDeepStrictEqual(result.value, field.value)
      );
    })
    .map(function key(field) {
      return field.key;
    });
  task.dictionaryHash = detail.dictionaryHash;
  task.runId = randomUUID();
  task.skillHash = "";
  if (
    task.phase === "completed" &&
    task.processedFields.length < task.scope.length
  ) {
    task.phase = "stopped";
    task.desired = "stopped";
    task.slotHeld = false;
    task.message = "字段结构已更新，保留已有成果；新增或合并字段待处理。";
  }
  return true;
}
