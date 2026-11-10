import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { normalizeStructuredValue } from "./structured-value.ts";
import { updateComputedFields } from './computed.ts';
import {
  hash,
  object,
  openDatabase,
  originalPath,
  readDetail,
  readSource,
} from "./database.ts";
import type { EncyclopediaPaths } from "./config.ts";
import type { TaskStore, WriteIntent } from "./store.ts";
import { fieldProgress } from "../../types/encyclopedia.ts";
import type {
  EntryTask,
  Evidence,
  FieldOutcome,
  FieldResult,
  Json,
} from "../../types/encyclopedia.ts";

function requireText(value: unknown, name: string, max = 2000000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(name + "不能为空或过长。");
  return value;
}
export function parseFieldResult(input: unknown): FieldResult {
  const body = object(input);
  const outcome = String(body.outcome) as FieldOutcome;
  if (
    ![
      "verified",
      "tentative",
      "not_found",
      "not_applicable",
      "conflict",
      "blocked",
    ].includes(outcome)
  )
    throw new Error("字段结果状态不合法。");
  if (!("value" in body))
    throw new Error("必须明确提供 value；无候选时为 null。");
  const evidence: Evidence[] = [];
  if (!Array.isArray(body.evidence)) throw new Error("必须提供证据数组。");
  for (const item of body.evidence) {
    const source = object(item);
    evidence.push({
      uri: requireText(source.uri, "来源位置", 4000),
      title: requireText(source.title, "来源标题", 1000),
      snapshot: requireText(source.snapshot, "来源快照"),
      excerpt: requireText(source.excerpt, "原文摘录", 50000),
      locator: requireText(source.locator, "来源定位", 2000),
      sourceId:
        typeof source.sourceId === "number" ? source.sourceId : undefined,
      documentPath:
        typeof source.documentPath === "string"
          ? source.documentPath
          : undefined,
      sourceDate:
        typeof source.sourceDate === "string" ? source.sourceDate : undefined,
    });
  }
  if (
    ["verified", "tentative"].includes(outcome) &&
    (body.value === null || !evidence.length)
  )
    throw new Error("采用或核实字段必须提供具体值与证据。");
  if (
    ["not_found", "not_applicable", "conflict", "blocked"].includes(outcome) &&
    body.value !== null
  )
    throw new Error("未采用候选的状态必须使用 value=null；程序会保留已有值。");
  const nextCondition =
    typeof body.nextCondition === "string" ? body.nextCondition : "";
  if (
    ["tentative", "not_found", "conflict", "blocked"].includes(outcome) &&
    !nextCondition.trim()
  )
    throw new Error("尚未解决的字段必须记录下次复核条件。");
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  if (outcome === "conflict" && candidates.length < 2)
    throw new Error("来源冲突必须保留至少两个候选及其证据。");
  for (const source of evidence)
    if (!source.snapshot.includes(source.excerpt))
      throw new Error("证据摘录必须逐字存在于来源快照。");
  return {
    field: requireText(body.field, "字段名", 150),
    outcome,
    value: body.value,
    reason: requireText(body.reason, "核查过程和采用原因", 20000),
    nextCondition,
    evidence,
    candidates,
    checkedAt: new Date().toISOString(),
    changed: false,
    readback: false,
  };
}

function validateValue(value: Json, type: string | null) {
  if (!type || type === "any" || type === "json") return;
  const name = type.toLowerCase();
  if ((name === "text" || name === "string") && typeof value !== "string")
    throw new Error("字段需要文本值。");
  if (name === "array" && !Array.isArray(value))
    throw new Error("字段需要数组。");
  if (
    name === "object" &&
    (!value || typeof value !== "object" || Array.isArray(value))
  )
    throw new Error("字段需要对象。");
  if (
    ["integer", "number", "real"].includes(name) &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      (name === "integer" && !Number.isInteger(value)))
  )
    throw new Error("字段需要有效数值。");
  if (name === "boolean" && typeof value !== "boolean")
    throw new Error("字段需要布尔值。");
}
function validateSources(
  config: EncyclopediaPaths,
  task: EntryTask,
  sources: Evidence[],
) {
  for (const source of sources) {
    if (source.sourceId !== undefined) {
      const stored = readSource(config, task.entityId, source.sourceId);
      if (
        stored.uri !== source.uri ||
        !String(stored.snapshot).includes(source.snapshot)
      )
        throw new Error("引用来源与数据库快照不一致。");
      if (
        String(stored.kind).includes("audit") ||
        String(stored.kind).includes("review")
      )
        throw new Error(
          "采集审计或审核结论不能作为独立原始证据，请引用其原始来源。",
        );
    } else if (source.documentPath) {
      const detail = readDetail(config, task.entityId);
      const document = detail.originals.find(function match(item) {
        return item.path === source.documentPath;
      });
      if (!document) throw new Error("原件未关联当前词条。");
      const file = originalPath(config, document.blob_path);
      let bytes = fs.readFileSync(file);
      if (file.endsWith(".gz"))
        bytes = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 });
      if (bytes.byteLength !== document.size || hash(bytes) !== document.sha256)
        throw new Error("本地原件长度或指纹不匹配。");
    } else {
      const url = new URL(source.uri);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("仅允许网络来源或已关联的本地原件。");
    }
  }
}
function insertSource(
  db: DatabaseSync,
  uri: string,
  key: string,
  kind: string,
  title: string,
  snapshot: string,
) {
  const fingerprint = hash(snapshot);
  db.prepare(
    "INSERT OR IGNORE INTO wiki_evidence_sources(uri,source_key,fingerprint,kind,title,snapshot) VALUES(?,?,?,?,?,?)",
  ).run(uri, key, fingerprint, kind, title, snapshot);
  return Number(
    db
      .prepare(
        "SELECT id FROM wiki_evidence_sources WHERE uri=? AND source_key=? AND fingerprint=?",
      )
      .get(uri, key, fingerprint)?.id,
  );
}
function linkSource(
  db: DatabaseSync,
  id: number,
  sourceId: number,
  field: string,
  role: string,
  locator: string,
  excerpt: string,
) {
  db.prepare(
    "INSERT OR IGNORE INTO wiki_entry_evidence(entity_id,source_id,field,role,locator,excerpt) VALUES(?,?,?,?,?,?)",
  ).run(
    id,
    sourceId,
    field,
    role,
    JSON.stringify({ location: locator }),
    excerpt,
  );
}

export class EntryWriter {
  private config: EncyclopediaPaths;
  private store: TaskStore;
  constructor(config: EncyclopediaPaths, store: TaskStore) {
    this.config = config;
    this.store = store;
  }

  submit(task: EntryTask, input: unknown): FieldResult {
    if (
      task.desired !== "running" ||
      !["running", "starting"].includes(task.phase)
    )
      throw new Error("任务已停止，不能提交。");
    const result = parseFieldResult(input);
    if (!task.scope.includes(result.field))
      throw new Error("字段不属于当前处理范围。");
    const previous = task.results[result.field];
    if (previous?.readback && task.processedFields.includes(result.field)) return previous;
    let detail = readDetail(this.config, task.entityId);
    if (detail.state === "excluded")
      throw new Error("被排除的词条不允许修改。");
    if (detail.dictionaryHash !== task.dictionaryHash)
      throw new Error("字段规则已变化，请重新处理全部字段。");
    const field = detail.fields.find(function match(item) {
      return item.key === result.field;
    });
    if (!field) throw new Error("字段不存在。");
    validateSources(this.config, task, result.evidence);
    const adopting =
      result.outcome === "verified" || result.outcome === "tentative";
    if (!adopting) result.value = field.value; // 缺资料不是清空已有内容的理由。
    if (adopting) {
      validateValue(result.value, field.valueType);
      if (detail.type === 'org' || detail.fields.some(function revised(item) { return item.key === "fields.component_suppliers"; }))
        result.value = normalizeStructuredValue(detail.type, result.field, result.value);
    }
    result.changed = !isDeepStrictEqual(field.value, result.value);
    if (result.changed && !field.writable)
      throw new Error("该字段为身份字段或暂停采集字段，不允许自动修改。");
    if (!result.changed) {
      const readback = readDetail(this.config, task.entityId);
      if (
        readback.dictionaryHash !== task.dictionaryHash ||
        readback.state === "excluded" ||
        !isDeepStrictEqual(
          readback.fields.find(function same(item) {
            return item.key === result.field;
          })?.value,
          result.value,
        )
      )
        throw new Error("核查期间实值或规则已变化，请重新读取。");
      result.readback = true;
      task.results[result.field] = result;
      if (!task.processedFields.includes(result.field)) task.processedFields.push(result.field);
      task.filled = fieldProgress(readback.fields).filled;
      this.store.save(task, "field_checked");
      return result;
    }

    const intent: WriteIntent = {
      id: randomUUID(),
      entityId: task.entityId,
      runId: task.runId,
      field: result.field,
      expectedVersion: detail.version,
      result,
      before: {},
      status: "prepared",
    };
    result.operationId = intent.id;
    const lockPath = path.join(
      this.config.dataRoot,
      "encyclopedia-sources",
      ".fixed-task-writer.sqlite",
    );
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const lock = new DatabaseSync(lockPath);
    let db: DatabaseSync | null = null;
    let transaction = false;
    try {
      lock.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
      db = openDatabase(this.config, false);
      db.exec("BEGIN IMMEDIATE");
      transaction = true;
      detail = readDetail(this.config, task.entityId, db);
      if (
        detail.version !== intent.expectedVersion ||
        detail.dictionaryHash !== task.dictionaryHash ||
        detail.state === "excluded"
      )
        throw new Error("版本、规则或词条状态已变化，未覆盖现值。");
      const current = detail.fields.find(function match(item) {
        return item.key === result.field;
      });
      if (!isDeepStrictEqual(current?.value, field.value))
        throw new Error("字段旧值已变化，未覆盖现值。");
      const profile = db
        .prepare("SELECT * FROM wiki_entry_profiles WHERE entity_id=?")
        .get(task.entityId)!;
      const article = db
        .prepare("SELECT * FROM wiki_articles WHERE entity_id=?")
        .get(task.entityId);
      const entity = db
        .prepare("SELECT ext_data FROM entities WHERE id=?")
        .get(task.entityId)!;
      if (!article) throw new Error("词条缺少正文记录，需先修复。");
      intent.before = {
        profile,
        article,
        ext_data: entity.ext_data,
        oldValue: current?.value,
      };
      // FULL 同步的独立任务库先保存意图，之后才修改业务内容。
      this.store.saveIntent(intent);
      task.unconfirmed++;
      this.store.save(task, "intent_prepared");
      const fields = object(profile.fields);
      const sections = object(profile.sections);
      // 固定列可能包含旧版扩展信息；并入基线，避免触发器把未修改的扩展值清空。
      for (const definition of detail.fields) {
        if (definition.storage === "fields" && definition.value !== null)
          fields[definition.fieldKey] = definition.value;
        if (definition.storage === "sections" && definition.value !== null)
          sections[definition.fieldKey] = definition.value;
      }
      const target = field.storage === "sections" ? sections : fields;
      target[field.fieldKey] = result.value;
      for (const source of result.evidence) {
        const sourceId =
          source.sourceId ??
          insertSource(
            db,
            source.uri,
            "encyclopedia-panel-source-v1",
            "agent-source-snapshot-v1",
            source.title,
            source.snapshot,
          );
        linkSource(
          db,
          task.entityId,
          sourceId,
          result.field,
          "collection-candidate",
          source.locator,
          source.excerpt,
        );
      }
      updateComputedFields(this.config, db, detail, fields, sections,
        Object.entries(task.results).filter(function notApplicable([, item]) { return item.outcome === 'not_applicable' && item.readback; }).map(function field([key]) { return key; }));
      db.prepare(
        "UPDATE wiki_entry_profiles SET fields=?,sections=?,version=version+1,updated_at=datetime('now'),state='pending',is_presentable=0,reason=? WHERE entity_id=? AND version=?",
      ).run(
        JSON.stringify(fields),
        JSON.stringify(sections),
        "百科采集工作台更新，待重新审核",
        task.entityId,
        intent.expectedVersion,
      );
      const ext = object(entity.ext_data);
      Object.assign(ext, {
        editorial_state: "pending",
        encyclopedia_hidden: true,
        is_presentable: false,
        entry_type: detail.type,
        display_fields: fields,
        display_sections: sections,
      });
      db.prepare(
        "UPDATE entities SET ext_data=?,updated_at=datetime('now') WHERE id=?",
      ).run(JSON.stringify(ext), task.entityId);
      const text: string[] = [];
      for (const definition of detail.fields) {
        if (definition.storage !== "sections") continue;
        const value = sections[definition.fieldKey];
        if (value === null || value === undefined || value === "") continue;
        const content =
          typeof value === "string" ? value : JSON.stringify(value, null, 2);
        text.push(
          ["book", "paper"].includes(detail.type)
            ? content
            : "## " + definition.label + "\n\n" + content,
        );
      }
      const content = text.length
        ? text.join("\n\n")
        : String(article.content_md || "");
      const revision =
        Math.max(
          Number(article.version),
          Number(
            db
              .prepare(
                "SELECT max(revision) n FROM wiki_revisions WHERE entity_id=?",
              )
              .get(task.entityId)?.n || 0,
          ),
        ) + 1;
      db.prepare(
        "UPDATE wiki_articles SET content_md=?,version=?,review_status='pending' WHERE entity_id=?",
      ).run(content, revision, task.entityId);
      db.prepare(
        "INSERT INTO wiki_revisions(entity_id,revision,snapshot,editor_id,summary) VALUES(?,?,?,NULL,?)",
      ).run(
        task.entityId,
        revision,
        JSON.stringify({
          ...article,
          content_md: content,
          version: revision,
          profile: { fields, sections },
        }),
        "百科字段核查：" + result.field,
      );
      const after = readDetail(this.config, task.entityId, db);
      if (
        !isDeepStrictEqual(
          after.fields.find(function match(item) {
            return item.key === result.field;
          })?.value,
          result.value,
        )
      )
        throw new Error("固定列同步校验失败，已回滚。");
      const logicalType =
        result.value === null
          ? "null"
          : Array.isArray(result.value)
            ? "array"
            : typeof result.value === "number"
              ? Number.isInteger(result.value)
                ? "integer"
                : "real"
              : typeof result.value === "boolean"
                ? String(result.value)
                : typeof result.value === "string"
                  ? "text"
                  : "object";
      const type = db
        .prepare(
          "SELECT json_type FROM wiki_column_value_types WHERE entity_id=? AND column_name=?",
        )
        .get(task.entityId, field.column);
      if (type?.json_type !== logicalType)
        throw new Error("字段逻辑类型同步失败，已回滚。");
      const snapshot = JSON.stringify({
        operationId: intent.id,
        runId: task.runId,
        entityId: task.entityId,
        before: intent.before,
        result,
        expectedVersion: intent.expectedVersion,
        committedVersion: after.version,
        committedArticleVersion: revision,
      });
      intent.auditFingerprint = hash(snapshot);
      this.store.saveIntent(intent);
      const auditId = insertSource(
        db,
        "urn:encyclopedia-panel:intent:" + intent.id,
        intent.id,
        "agent-fill-audit-v1",
        "词条字段修改审计",
        snapshot,
      );
      linkSource(
        db,
        task.entityId,
        auditId,
        result.field,
        "history",
        "事务内采用记录",
        result.reason,
      );
      db.exec("COMMIT");
      transaction = false;
    } catch (error) {
      if (transaction && db) db.exec("ROLLBACK");
      intent.error = error instanceof Error ? error.message : String(error);
      // 即使 COMMIT 响应异常，也由恢复查询审计记录决定，不猜测提交状态。
      if (Object.keys(intent.before).length) this.store.saveIntent(intent);
      throw error;
    } finally {
      db?.close();
      try {
        lock.exec("ROLLBACK");
      } catch {
        /* 未取得门禁或已结束。 */
      }
      lock.close();
    }
    this.recover(task);
    const saved = task.results[result.field];
    if (!saved?.readback) throw new Error("提交后回读未确认，已阻止后续提交。");
    return saved;
  }

  recover(task: EntryTask) {
    const intents = this.store.intents(task.entityId);
    const db = openDatabase(this.config);
    try {
      for (const intent of intents) {
        const audit = db
          .prepare(
            "SELECT s.snapshot,s.fingerprint FROM wiki_evidence_sources s JOIN wiki_entry_evidence e ON e.source_id=s.id WHERE s.source_key=? AND s.kind='agent-fill-audit-v1' AND e.entity_id=? AND e.role='history'",
          )
          .get(intent.id, task.entityId);
        const detail = readDetail(this.config, task.entityId, db);
        const value = detail.fields.find(function match(item) {
          return item.key === intent.field;
        })?.value;
        const profile = db
          .prepare(
            "SELECT fields,sections,state,is_presentable FROM wiki_entry_profiles WHERE entity_id=?",
          )
          .get(task.entityId)!;
        const ext = object(
          db
            .prepare("SELECT ext_data FROM entities WHERE id=?")
            .get(task.entityId)!.ext_data,
        );
        const article = db
          .prepare(
            "SELECT version,review_status FROM wiki_articles WHERE entity_id=?",
          )
          .get(task.entityId);
        const [storage, fieldKey] = intent.field.split(".");
        const baseline = object(profile[storage]);
        const adopted = audit ? JSON.parse(String(audit.snapshot)) : null;
        const consistent =
          profile.state === "pending" &&
          profile.is_presentable === 0 &&
          ext.encyclopedia_hidden === true &&
          ext.is_presentable === false &&
          article?.review_status === "pending" &&
          Number(article?.version) >=
            Number(adopted?.committedArticleVersion) &&
          isDeepStrictEqual(baseline[fieldKey], intent.result.value);
        if (
          audit &&
          consistent &&
          hash(String(audit.snapshot)) === intent.auditFingerprint &&
          audit.fingerprint === intent.auditFingerprint &&
          isDeepStrictEqual(value, intent.result.value) &&
          detail.version >= intent.expectedVersion + 1
        ) {
          intent.status = "confirmed";
          intent.result.readback = true;
          if (intent.runId === task.runId) {
            task.results[intent.field] = intent.result;
            if (!task.processedFields.includes(intent.field)) task.processedFields.push(intent.field);
          }
        } else if (
          !audit &&
          detail.version === intent.expectedVersion &&
          isDeepStrictEqual(value, intent.before.oldValue)
        ) {
          intent.status = "not_committed";
        } else {
          intent.status = "conflict";
          intent.error = "提交状态或后续修改存在冲突，需核对审计与实库。";
        }
        this.store.saveIntent(intent);
      }
      task.unconfirmed = this.store.intents(task.entityId).length;
      task.filled = fieldProgress(readDetail(this.config, task.entityId, db).fields).filled;
      this.store.save(task, intents.length ? "readback" : undefined);
    } finally {
      db.close();
    }
  }
}
