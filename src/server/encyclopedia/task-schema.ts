import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import type { EntryDetail, EntryTask } from "../../types/encyclopedia.ts";
import {fieldProgress, isTrackedField, processedFieldKeys, taskProgress} from "../../types/encyclopedia.ts";

// New or transformed fields are pending; unchanged confirmed results survive.
export function reconcileTaskSchema(task: EntryTask, detail: Pick<EntryDetail, "fields" | "dictionaryHash">, changedFields = new Set<string>()) {
  const before = JSON.stringify([task.dictionaryHash, task.scope, task.processedFields, task.computedFields, task.fieldRuleHashes, task.filled, task.phase]);
  const schemaChanged = task.dictionaryHash !== detail.dictionaryHash;
  const hadDictionary = !!task.dictionaryHash;
  const confirmed = new Set(processedFieldKeys(task));
  const previousScope = new Set(task.scope);
  const ruleHashes: Record<string, string> = {};
  for (const field of detail.fields) {
    if (!field.writable) continue;
    const rules = { ...field.rules };
    for (const key of ["ordinal", "contract_version", "label", "group_name"]) delete rules[key];
    const fingerprint = createHash("sha256").update(JSON.stringify(rules)).digest("hex");
    ruleHashes[field.key] = fingerprint;
    if (task.fieldRuleHashes?.[field.key] && task.fieldRuleHashes[field.key] !== fingerprint) changedFields.add(field.key);
  }
  task.scope = detail.fields
    .filter(isTrackedField)
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
        !changedFields.has(field.key) &&
        result?.readback &&
        isDeepStrictEqual(result.value, field.value)
      );
    })
    .map(function key(field) {
      return field.key;
    });
  task.dictionaryHash = detail.dictionaryHash;
  task.computedFields = {};
  task.fieldRuleHashes = ruleHashes;
  task.filled = fieldProgress(detail.fields, task).filled;
  delete task.displayProgress;
  if (
    task.phase === "completed" &&
    taskProgress(task).checked < task.scope.length
  ) {
    task.phase = "stopped";
    task.desired = "stopped";
    task.slotHeld = false;
    task.message = "已与百科数据库对齐；资料字段尚未全部核查，已有成果保留。";
  } else if (task.phase !== "completed" && task.desired === "stopped" &&
             task.scope.length > 0 && taskProgress(task).checked === task.scope.length) {
    task.phase = "completed";
    task.slotHeld = false;
    task.nextRetryAt = null;
    task.message = "已与百科数据库对齐；资料字段均已处理，程序计算字段不计入采集任务。";
  }
  const after = JSON.stringify([task.dictionaryHash, task.scope, task.processedFields, task.computedFields, task.fieldRuleHashes, task.filled, task.phase]);
  if (before === after) return false;
  if (schemaChanged && hadDictionary) {
    task.runId = randomUUID();
    task.skillHash = "";
  }
  return true;
}
