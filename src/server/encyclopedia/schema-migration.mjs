import { createHash } from "node:crypto";

const quote = function quote(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw Error("Invalid SQL identifier: " + name);
  return '"' + name + '"';
};
const literal = function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
};
function encode(value) {
  return value == null
    ? null
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}
function kind(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "real";
  return typeof value === "object" ? "object" : "text";
}
function hasTable(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );
}

export function preserveNonNameEnglishValue(legacyName, aliases) {
  if (legacyName == null || typeof legacyName === "string") return aliases;
  const retained = {
    legacy_english_name: legacyName,
    note: "旧英文名称字段包含非名称数据，保留待复核，不作为机构英文名。",
  };
  if (aliases == null || aliases === "") return [retained];
  return [aliases, retained];
}

export function migrationPlan(db, contract) {
  const types = db.prepare("SELECT * FROM wiki_entry_types ORDER BY key").all();
  const plans = [];
  for (const type of types) {
    if (contract.REMOVED_TYPES.includes(type.key)) continue;
    const rows = db
      .prepare(
        "SELECT * FROM wiki_column_fields WHERE type_key=? ORDER BY storage,ordinal",
      )
      .all(type.key);
    const previous = rows.map(function definition(row) {
      return {
        key: row.field_key,
        label: row.label,
        storage: row.storage,
        type: row.value_type,
        group: row.group_name,
        description: row.description,
        collectionMode: row.collection_mode,
        old: row,
      };
    });
    plans.push({
      key: type.key,
      name: type.key === "lecture" ? "课程" : type.name,
      description: type.description,
      definitions: contract.revisionFields(type.key, previous),
      previous: rows,
    });
  }
  if (
    !plans.some(function conference(item) {
      return item.key === "conference";
    })
  )
    plans.push({
      key: "conference",
      name: "会议",
      description: "学术会议、研讨会与会议资料",
      definitions: contract.revisionFields("conference", []),
      previous: [],
    });
  for (const plan of plans) {
    const keys = new Set();
    const columns = new Set(["entity_id", "name", "name_en"]);
    for (const item of plan.definitions) {
      const key = item.storage + "." + item.key;
      if (keys.has(key)) throw Error("Duplicate field: " + key);
      keys.add(key);
      item.column = columns.has(item.key)
        ? item.storage + "_" + item.key
        : item.key;
      if (columns.has(item.column))
        throw Error("Duplicate column: " + item.column);
      columns.add(item.column);
    }
  }
  return plans;
}

function entryValues(db, row, definitions) {
  const fields = JSON.parse(row.profile_fields),
    sections = JSON.parse(row.profile_sections);
  const kinds = new Map(
    db
      .prepare(
        "SELECT column_name,json_type FROM wiki_column_value_types WHERE entity_id=?",
      )
      .all(row.entity_id)
      .map(function pair(item) {
        return [item.column_name, item.json_type];
      }),
  );
  for (const definition of definitions) {
    if (definition.storage === "identity") continue;
    let value = row[definition.column_name];
    if (value === undefined) continue;
    const type = kinds.get(definition.column_name);
    if (typeof value === "string" && type && type !== "text")
      value = JSON.parse(value);
    if (
      value !== null ||
      !(
        definition.field_key in
        (definition.storage === "fields" ? fields : sections)
      )
    )
      (definition.storage === "fields" ? fields : sections)[
        definition.field_key
      ] = value;
  }
  return { fields, sections };
}

function deviceContext(db, id, coverUrl) {
  const images = hasTable(db, "wiki_entry_media")
    ? db
        .prepare(
          "SELECT sha256,alt_text,credit,original_url AS url,role FROM wiki_entry_media WHERE entity_id=? AND state='approved' ORDER BY CASE WHEN role='cover' THEN 0 ELSE 1 END,created_at",
        )
        .all(id)
    : [];
  const relatedPapers = hasTable(db, "wiki_entity_relations")
    ? db
        .prepare(
          "SELECT e.id AS entity_id,e.name AS title FROM wiki_entity_relations r JOIN entities e ON e.id=r.object_id JOIN wiki_entry_profiles p ON p.entity_id=e.id WHERE r.subject_id=? AND p.type_key='paper'",
        )
        .all(id)
    : [];
  const codeRepositories =
    hasTable(db, "wiki_type_code") && hasTable(db, "wiki_entity_relations")
      ? db
          .prepare(
            "SELECT e.name,c.code_url AS url FROM wiki_entity_relations r JOIN entities e ON e.id=r.object_id JOIN wiki_type_code c ON c.entity_id=e.id WHERE r.subject_id=?",
          )
          .all(id)
      : [];
  return { images, relatedPapers, codeRepositories, coverUrl };
}

function removeExcludedEntries(db, ids, removedTypes) {
  db.exec("CREATE TEMP TABLE removed_entries(id INTEGER PRIMARY KEY)");
  db.prepare("INSERT INTO removed_entries SELECT value FROM json_each(?)").run(
    JSON.stringify(ids),
  );
  const tables = db
    .prepare(
      "SELECT name,type FROM pragma_table_list WHERE schema='main' AND type IN ('table','virtual') AND name NOT LIKE 'sqlite_%'",
    )
    .all();
  for (const table of tables) {
    const columns = db
      .prepare("PRAGMA table_info(" + quote(table.name) + ")")
      .all();
    if (
      columns.some(function match(column) {
        return column.name === "entity_id";
      })
    )
      db.exec(
        "DELETE FROM " +
          quote(table.name) +
          " WHERE entity_id IN (SELECT id FROM removed_entries)",
      );
  }
  db.exec("DELETE FROM entities WHERE id IN (SELECT id FROM removed_entries)");
  for (const type of removedTypes) {
    db.prepare("DELETE FROM wiki_column_fields WHERE type_key=?").run(type);
    if (hasTable(db, "wiki_entry_display_settings"))
      db.prepare(
        "DELETE FROM wiki_entry_display_settings WHERE type_key=?",
      ).run(type);
    db.prepare("DELETE FROM wiki_entry_types WHERE key=?").run(type);
    if (hasTable(db, "wiki_type_" + type))
      db.exec("DROP TABLE " + quote("wiki_type_" + type));
  }
  // Foreign keys remain disabled only inside this migration. Remove dependent
  // rows, retaining nullable links where their declared policy is SET NULL.
  for (let pass = 0; pass < 20; pass++) {
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (!violations.length) return;
    for (const violation of violations) {
      if (violation.rowid === null)
        throw Error("Unsupported orphan without rowid: " + violation.table);
      const keys = db
        .prepare("PRAGMA foreign_key_list(" + quote(violation.table) + ")")
        .all()
        .filter(function match(key) {
          return key.id === violation.fkid;
        });
      if (
        keys.length &&
        keys.every(function nullable(key) {
          return key.on_delete === "SET NULL";
        })
      )
        db.prepare(
          "UPDATE " +
            quote(violation.table) +
            " SET " +
            keys
              .map(function column(key) {
                return quote(key.from) + "=NULL";
              })
              .join(",") +
            " WHERE rowid=?",
        ).run(violation.rowid);
      else
        db.prepare(
          "DELETE FROM " + quote(violation.table) + " WHERE rowid=?",
        ).run(violation.rowid);
    }
  }
  throw Error("Could not resolve excluded entry dependencies");
}

function installTriggers(db, plan) {
  const table = quote("wiki_type_" + plan.key),
    defs = plan.definitions;
  const columns = defs.map(function column(item) {
    return quote(item.column);
  });
  const values = defs.map(function value(item) {
    const input = "NEW." + item.storage,
      location = literal("$." + item.key);
    return (
      "CASE json_type(" +
      input +
      "," +
      location +
      ") WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE json_extract(" +
      input +
      "," +
      location +
      ") END"
    );
  });
  const guards = [];
  for (const storage of ["fields", "sections"]) {
    const allowed = defs
      .filter(function match(item) {
        return item.storage === storage;
      })
      .map(function key(item) {
        return literal(item.key);
      });
    guards.push(
      "SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW." +
        storage +
        ") WHERE key NOT IN (" +
        (allowed.join(",") || "''") +
        ")) THEN RAISE(ABORT,'COLUMN_UNKNOWN_FIELD') END;",
    );
  }
  const typeUpdates = defs
    .map(function type(item) {
      return (
        "INSERT INTO wiki_column_value_types(entity_id,column_name,json_type) VALUES(NEW.entity_id," +
        literal(item.column) +
        ",COALESCE(json_type(NEW." +
        item.storage +
        "," +
        literal("$." + item.key) +
        "),'null'));"
      );
    })
    .join("\n");
  const upsert =
    "INSERT INTO " +
    table +
    "(entity_id,name,name_en," +
    columns.join(",") +
    ") SELECT NEW.entity_id,e.name,e.name_en," +
    values.join(",") +
    " FROM entities e WHERE e.id=NEW.entity_id ON CONFLICT(entity_id) DO UPDATE SET " +
    columns
      .map(function update(column) {
        return column + "=excluded." + column;
      })
      .join(",") +
    ";";
  for (const operation of ["INSERT", "UPDATE"])
    db.exec(
      "CREATE TRIGGER " +
        quote("wiki_columns_" + plan.key + "_" + operation.toLowerCase()) +
        " AFTER " +
        operation +
        " ON wiki_entry_profiles WHEN NEW.type_key=" +
        literal(plan.key) +
        " BEGIN " +
        guards.join("\n") +
        " DELETE FROM wiki_column_value_types WHERE entity_id=NEW.entity_id; " +
        typeUpdates +
        upsert +
        " END",
    );
  db.exec(
    "CREATE TRIGGER " +
      quote("wiki_columns_" + plan.key + "_delete") +
      " AFTER DELETE ON wiki_entry_profiles WHEN OLD.type_key=" +
      literal(plan.key) +
      " BEGIN DELETE FROM " +
      table +
      " WHERE entity_id=OLD.entity_id; DELETE FROM wiki_column_value_types WHERE entity_id=OLD.entity_id; END",
  );
  db.exec(
    "CREATE TRIGGER " +
      quote("wiki_columns_" + plan.key + "_name") +
      " AFTER UPDATE OF name,name_en ON entities BEGIN UPDATE " +
      table +
      " SET name=NEW.name,name_en=NEW.name_en WHERE entity_id=NEW.id; END",
  );
  function profileJson(storage) {
    const items = defs.filter(function match(item) {
      return item.storage === storage;
    });
    if (!items.length) return "'{}'";
    const selects = items.map(function entry(item) {
      const column = "NEW." + quote(item.column);
      const type =
        "(SELECT json_type FROM wiki_column_value_types WHERE entity_id=NEW.entity_id AND column_name=" +
        literal(item.column) +
        ")";
      return (
        "SELECT " +
        literal(item.key) +
        " AS key,CASE WHEN " +
        column +
        " IS NULL THEN 'null' WHEN " +
        type +
        " IN ('object','array','true','false','integer','real') AND json_valid(" +
        column +
        ") THEN " +
        column +
        " ELSE json_quote(" +
        column +
        ") END AS value"
      );
    });
    return (
      "(SELECT json_group_object(key,json(value)) FROM (" +
      selects.join(" UNION ALL ") +
      "))"
    );
  }
  db.exec(
    "CREATE TRIGGER " +
      quote("wiki_columns_" + plan.key + "_reverse") +
      " AFTER UPDATE OF " +
      columns.join(",") +
      " ON " +
      table +
      " WHEN " +
      columns
        .map(function changed(column) {
          return "NEW." + column + " IS NOT OLD." + column;
        })
        .join(" OR ") +
      " BEGIN UPDATE wiki_entry_profiles SET fields=" +
      profileJson("fields") +
      ",sections=" +
      profileJson("sections") +
      " WHERE entity_id=NEW.entity_id; END",
  );
}

export function applySchemaMigration(db, contract, fingerprint) {
  if (!hasTable(db, "encyclopedia_workspace"))
    throw Error("Only a marked maintenance database may be migrated");
  if (hasTable(db, "encyclopedia_release"))
    throw Error("Release databases cannot be migrated");
  const previous = db
    .prepare("SELECT sha256 FROM wiki_entry_schema_migrations WHERE version=?")
    .get(contract.SCHEMA_REVISION);
  if (previous) {
    if (previous.sha256 !== fingerprint)
      throw Error("Schema revision fingerprint conflict");
    return { alreadyApplied: true };
  }
  if (db.prepare("PRAGMA foreign_key_check").get())
    throw Error("Source database has foreign-key violations");
  // Revision 6 changes collection policy only. Preserve content tables, values,
  // evidence and computed results instead of rebuilding the entire database.
  const currentRevision = Number(db.prepare("SELECT max(version) version FROM wiki_entry_schema_migrations").get()?.version || 0);
  if (contract.SCHEMA_REVISION === 6 && currentRevision === 5) {
    const rows = db.prepare("SELECT * FROM wiki_column_fields WHERE storage<>'identity' AND collection_mode='paused'").all();
    db.exec("BEGIN IMMEDIATE");
    try {
      const update = db.prepare("UPDATE wiki_column_fields SET collection_mode=?,description=?,source_policy=?,contract_version=? WHERE type_key=? AND storage=? AND field_key=?");
      for (const row of rows) {
        const released = contract.releaseCollectionFreeze({...row, collectionMode: row.collection_mode});
        update.run(released.collectionMode, released.description, released.source_policy, 6, row.type_key, row.storage, row.field_key);
      }
      db.prepare("INSERT INTO wiki_entry_schema_migrations(version,sha256) VALUES(?,?)").run(6, fingerprint);
      db.exec("COMMIT");
      return { version: 6, releasedFields: rows.length, removedIds: [], policyOnly: true };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const plans = migrationPlan(db, contract);
  const previousRevision = Number(db.prepare("SELECT max(version) version FROM wiki_entry_schema_migrations").get()?.version || 0);
  const removed = db
    .prepare(
      "SELECT entity_id FROM wiki_entry_profiles WHERE type_key IN (SELECT value FROM json_each(?))",
    )
    .all(JSON.stringify(contract.REMOVED_TYPES))
    .map(function id(row) {
      return row.entity_id;
    });
  const total = Number(db.prepare("SELECT count(*) n FROM entities").get().n);
  const report = {
    version: contract.SCHEMA_REVISION,
    removedIds: removed,
    types: [],
    totalBefore: total,
    totalAfter: 0,
  };
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
  try {
    for (const row of db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'wiki_columns_%'",
      )
      .all())
      db.exec("DROP TRIGGER " + quote(row.name));
    for (const plan of plans) {
      const columns = plan.definitions.map(function column(item) {
        if (contract.SCORE_KEYS?.includes(item.key)) return quote(item.column) + ' REAL CHECK(' + quote(item.column) + ' IS NULL OR (typeof(' + quote(item.column) + ") IN ('integer','real') AND " + quote(item.column) + ' BETWEEN 0 AND 100))';
        if (item.key === 'internal_citation_count') return quote(item.column) + ' INTEGER CHECK(' + quote(item.column) + ' IS NULL OR (typeof(' + quote(item.column) + ")='integer' AND " + quote(item.column) + '>=0))';
        return quote(item.column) + " TEXT";
      });
      db.exec(
        "CREATE TABLE " +
          quote("revision_" + plan.key) +
          "(entity_id INTEGER PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,name TEXT NOT NULL,name_en TEXT," +
          columns.join(",") +
          ")",
      );
      const fields = plan.definitions
        .filter(function field(item) {
          return item.storage === "fields";
        })
        .map(function label(item) {
          return [item.key, item.label];
        });
      const sections = plan.definitions
        .filter(function field(item) {
          return item.storage === "sections";
        })
        .map(function label(item) {
          return [item.key, item.label];
        });
      db.prepare(
        "INSERT INTO wiki_entry_types(key,name,description,fields,sections,policy,version) VALUES(?,?,?,?,?,'structured',?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,fields=excluded.fields,sections=excluded.sections,version=excluded.version",
      ).run(
        plan.key,
        plan.name,
        plan.description,
        JSON.stringify(fields),
        JSON.stringify(sections),
        contract.SCHEMA_REVISION,
      );
    }
    const byKey = new Map(
      plans.map(function pair(plan) {
        return [plan.key, plan];
      }),
    );
    const statements = new Map();
    for (const plan of plans) {
      const columns = [
        "entity_id",
        "name",
        "name_en",
        ...plan.definitions.map(function column(item) {
          return item.column;
        }),
      ];
      statements.set(
        plan.key,
        db.prepare(
          "INSERT INTO " +
            quote("revision_" + plan.key) +
            "(" +
            columns.map(quote).join(",") +
            ") VALUES(" +
            columns
              .map(function placeholder() {
                return "?";
              })
              .join(",") +
            ")",
        ),
      );
    }
    const updateProfile = db.prepare(
      "UPDATE wiki_entry_profiles SET type_key=?,fields=?,sections=?,version=version+1,updated_at=datetime('now') WHERE entity_id=?",
    );
    const clearKinds = db.prepare(
      "DELETE FROM wiki_column_value_types WHERE entity_id=?",
    );
    const saveKind = db.prepare(
      "INSERT INTO wiki_column_value_types(entity_id,column_name,json_type) VALUES(?,?,?)",
    );
    const mappedEvidence = db.prepare(
      "INSERT OR IGNORE INTO wiki_entry_evidence(entity_id,source_id,field,role,locator,excerpt) SELECT entity_id,source_id,?,role,locator,excerpt FROM wiki_entry_evidence WHERE entity_id=? AND field=?",
    );
    for (const plan of plans) {
      if (!hasTable(db, "wiki_type_" + plan.key)) continue;
      let count = 0;
      const rows = db.prepare(
        "SELECT t.*,p.fields AS profile_fields,p.sections AS profile_sections,e.cover_url FROM " +
          quote("wiki_type_" + plan.key) +
          " t JOIN wiki_entry_profiles p ON p.entity_id=t.entity_id JOIN entities e ON e.id=t.entity_id",
      );
      for (const row of rows.iterate()) {
        const original = entryValues(db, row, plan.previous);
        const targetType =
          plan.key === "lecture" && previousRevision < 3
            ? contract.classifyLearningEntry(row.name, original.fields)
            : plan.key;
        const target = byKey.get(targetType);
        const context =
          plan.key === "device" && previousRevision < 3
            ? deviceContext(db, row.entity_id, row.cover_url)
            : {};
        context.nameEn = row.name_en;
        const values = contract.transformEntry(
          targetType,
          original.fields,
          original.sections,
          context,
        );
        if (targetType === "org")
          values.fields.aliases = preserveNonNameEnglishValue(original.fields.english_name, values.fields.aliases);
        const fields = {},
          sections = {};
        for (const definition of target.definitions)
          (definition.storage === "fields" ? fields : sections)[
            definition.key
          ] =
            (definition.storage === "fields" ? values.fields : values.sections)[
              definition.key
            ] ?? null;
        // Names stay stable. Carry an existing original English name into the
        // identity slot when its former duplicate column is removed.
        const english =
          row.name_en ||
          (["device", "org", ...contract.FREE_TYPES].includes(plan.key)
            && typeof original.fields.english_name === "string"
            ? original.fields.english_name
            : null);
        if (english && !row.name_en)
          db.prepare("UPDATE entities SET name_en=? WHERE id=?").run(
            encode(english),
            row.entity_id,
          );
        statements.get(targetType).run(
          row.entity_id,
          row.name,
          encode(english),
          ...target.definitions.map(function value(definition) {
            return encode(
              (definition.storage === "fields" ? fields : sections)[
                definition.key
              ],
            );
          }),
        );
        updateProfile.run(
          targetType,
          JSON.stringify(fields),
          JSON.stringify(sections),
          row.entity_id,
        );
        clearKinds.run(row.entity_id);
        for (const definition of target.definitions)
          saveKind.run(
            row.entity_id,
            definition.column,
            kind(
              (definition.storage === "fields" ? fields : sections)[
                definition.key
              ],
            ),
          );
        for (const [destination, sources] of Object.entries(
          contract.MERGES[targetType] || {},
        ))
          for (const source of sources)
            mappedEvidence.run(destination, row.entity_id, source);
        if (contract.FREE_TYPES.includes(targetType))
          for (const previous of plan.previous)
            if (previous.storage !== "identity")
              mappedEvidence.run(
                "fields.content",
                row.entity_id,
                previous.storage + "." + previous.field_key,
              );
        if (targetType === "device") {
          for (const key of [
            "experiments",
            "achievements",
            "pulse_records",
            "status",
            "decommissioning",
          ])
            mappedEvidence.run(
              "fields.timeline",
              row.entity_id,
              "fields." + key,
            );
          mappedEvidence.run(
            "fields.timeline",
            row.entity_id,
            "sections.history",
          );
          mappedEvidence.run(
            "fields.objectives",
            row.entity_id,
            "sections.research",
          );
          mappedEvidence.run(
            "fields.parameters",
            row.entity_id,
            "fields.specifications",
          );
        }
        if (targetType === "org") {
          if (typeof original.fields.english_name === "string")
            mappedEvidence.run("identity.name_en", row.entity_id, "fields.english_name");
          if (original.fields.english_name != null && (typeof original.fields.english_name !== "string" || row.name_en && row.name_en !== original.fields.english_name))
            mappedEvidence.run("fields.aliases", row.entity_id, "fields.english_name");
        }
        count++;
      }
      report.types.push({
        key: plan.key,
        entries: count,
        fieldsBefore: plan.previous.filter(function content(item) {
          return item.storage !== "identity";
        }).length,
        fieldsAfter: plan.definitions.length,
      });
    }
    for (const plan of plans) {
      if (hasTable(db, "wiki_type_" + plan.key))
        db.exec("DROP TABLE " + quote("wiki_type_" + plan.key));
      db.exec(
        "ALTER TABLE " +
          quote("revision_" + plan.key) +
          " RENAME TO " +
          quote("wiki_type_" + plan.key),
      );
      db.prepare("DELETE FROM wiki_column_fields WHERE type_key=?").run(
        plan.key,
      );
      const insert = db.prepare(
        "INSERT INTO wiki_column_fields(type_key,table_name,column_name,field_key,label,group_name,storage,ordinal,value_type,description,collection_mode,contract_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      const identity = [
        ["entity_id", "稳定实体ID"],
        ["name", "规范名称"],
        ["name_en", "英文原名"],
      ];
      for (const [key, label] of identity)
        insert.run(
          plan.key,
          "wiki_type_" + plan.key,
          key,
          key,
          label,
          "身份信息",
          "identity",
          -3 +
            identity.findIndex(function match(item) {
              return item[0] === key;
            }),
          key === "entity_id" ? "integer" : "text",
          "保留现有身份信息，不改变词条ID与主体。",
          "system",
          contract.SCHEMA_REVISION,
        );
      let ordinal = 0;
      for (const item of plan.definitions) {
        insert.run(
          plan.key,
          "wiki_type_" + plan.key,
          item.column,
          item.key,
          item.label,
          item.group || "基本资料",
          item.storage,
          ordinal++,
          item.type || "json",
          item.description ||
            "按字段含义核查真实资料，保留时间、条件与来源；无依据不得编造。",
          item.collectionMode || item.old?.collection_mode || "evidence_required",
          contract.SCHEMA_REVISION,
        );
        // Keep established collection rules only where the field's contract is unchanged.
        if (
          item.old &&
          item.type === item.old.value_type &&
          item.description === item.old.description
        ) {
          const extras = [
            "definition",
            "exclusions",
            "format_rule",
            "unit_rule",
            "cardinality",
            "applicability",
            "source_policy",
            "missing_rule",
            "conflict_rule",
            "evidence_rule",
            "validation_rule",
            "example_json",
            "counterexample_json",
          ];
          db.prepare(
            "UPDATE wiki_column_fields SET " +
              extras
                .map(function assignment(key) {
                  return quote(key) + "=?";
                })
                .join(",") +
              " WHERE type_key=? AND storage=? AND field_key=?",
          ).run(
            ...extras.map(function value(key) {
              return item.old[key] ?? null;
            }),
            plan.key,
            item.storage,
            item.key,
          );
        }
      }
      if (hasTable(db, "wiki_entry_display_settings"))
        db.prepare(
          "INSERT INTO wiki_entry_display_settings VALUES(?,'published',?) ON CONFLICT(type_key) DO UPDATE SET content_mode='published',expansion_version=excluded.expansion_version",
        ).run(plan.key, contract.SCHEMA_REVISION);
    }
    removeExcludedEntries(db, removed, contract.REMOVED_TYPES);
    for (const plan of plans) installTriggers(db, plan);
    const allowed = plans
      .map(function key(plan) {
        return literal(plan.key);
      })
      .join(",");
    for (const operation of ["INSERT", "UPDATE"])
      db.exec(
        "CREATE TRIGGER " +
          quote("wiki_columns_known_" + operation.toLowerCase()) +
          " BEFORE " +
          operation +
          " ON wiki_entry_profiles WHEN NEW.type_key NOT IN (" +
          allowed +
          ") BEGIN SELECT RAISE(ABORT,'COLUMN_UNKNOWN_TYPE'); END",
      );
    if (hasTable(db, "wiki_fields_fts")) {
      db.exec(
        "DELETE FROM wiki_fields_fts; INSERT INTO wiki_fields_fts(entity_id,name,fields) SELECT e.id,e.name,p.fields||' '||p.sections FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id",
      );
      if (hasTable(db, "wiki_search_fts_rows"))
        db.exec(
          "DELETE FROM wiki_search_fts_rows; INSERT INTO wiki_search_fts_rows(row_id,entity_id) SELECT rowid,entity_id FROM wiki_fields_fts",
        );
    }
    if (hasTable(db, "wiki_graph_queue"))
      db.exec(
        "INSERT OR IGNORE INTO wiki_graph_queue(entity_id) SELECT entity_id FROM wiki_entry_profiles",
      );
    db.prepare(
      "INSERT INTO wiki_entry_schema_migrations(version,sha256) VALUES(?,?)",
    ).run(contract.SCHEMA_REVISION, fingerprint);
    report.totalAfter = Number(
      db.prepare("SELECT count(*) n FROM entities").get().n,
    );
    if (report.totalAfter !== total - removed.length)
      throw Error("Entity count invariant failed");
    if (db.prepare("PRAGMA foreign_key_check").get())
      throw Error("Migration produced foreign-key violations");
    db.exec("COMMIT");
    return report;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}

export function schemaFingerprint(source) {
  return createHash("sha256").update(source).digest("hex");
}
