import path from 'node:path';
import {createRequire} from 'node:module';
import type {DatabaseSync} from 'node:sqlite';
import type {EncyclopediaPaths} from './config.ts';
import type {EntryDetail, Json} from '../../types/encyclopedia.ts';

const requireContract = createRequire(import.meta.url);

// The website owns the rules; this tool only supplies current content and evidence.
export function updateComputedFields(config: EncyclopediaPaths, db: DatabaseSync, detail: EntryDetail, fields: Record<string, Json>, sections: Record<string, Json>, notApplicable: string[] = []) {
  if (!detail.fields.some(function score(field) { return field.fieldKey === 'quality_score'; })) return;
  const file = process.env.ENCYCLOPEDIA_CONTRACT_PATH || path.resolve(config.dataRoot,'..','src','lib','encyclopedia-schema-revision.mjs');
  const contract = requireContract(file);
  const definitions = detail.fields.map(function definition(field) {
    return {key:field.fieldKey,storage:field.storage,type:field.valueType,collectionMode:field.rules.collection_mode};
  });
  const evidence = db.prepare('SELECT e.field,e.role,e.excerpt,s.uri,s.kind,e.source_id FROM wiki_entry_evidence e JOIN wiki_evidence_sources s ON s.id=e.source_id WHERE e.entity_id=?').all(detail.id);
  Object.assign(fields,contract.scoreEntry({fields,sections,definitions,evidence,notApplicable}));
  if (detail.type === 'org') {
    const candidates = db.prepare("SELECT e.id entity_id,e.name,p.fields FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id WHERE p.type_key='org' AND e.deleted_at IS NULL AND p.state<>'excluded'").all().map(function candidate(row) {
      return {...row,fields:JSON.parse(String(row.fields))};
    });
    fields.related_organizations = contract.recommendOrganizations({entity_id:detail.id,fields},candidates);
  }
}
