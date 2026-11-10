import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStructuredValue as normalize} from '../src/server/encyclopedia/structured-value.ts';
import {normalizeStructuredValue} from '../src/server/encyclopedia/structured-value.ts';

test('device submissions preserve chronology, reject malformed systems and keep science JSON free',function(){
 const events=[null,'2024-02','1998'].map(function(date){return {date,title:'record',kind:'result',description:'source'};});
 assert.deepEqual(normalize('device','fields.timeline',events).map(function(row){return row.date;}),['1998','2024-02',null]);
 assert.throws(function(){normalize('device','fields.timeline',[{date:'unknown'}]);},/日期/);
 assert.throws(function(){normalize('device','fields.systems',[{name:'coil'}]);},/description/);
 assert.throws(function(){normalize('device','fields.gallery',[]);},/对象/);
 const arbitrary={any:['shape',{is:'allowed'}]};
 assert.equal(normalize('concept','fields.content',arbitrary),arbitrary);
});

test('timeline retains links, assigns stable IDs and rejects impossible dates or reversed intervals', function () {
 const input = [{date:'2024-02-29',title:'运行',kind:'status',description:'原始记录',state:'occurred',status_after:'运行',source_url:'https://example.test/report'}];
 const value = normalize('device','fields.timeline',input);
 assert.ok(value[0].id);
 assert.equal(value[0].source_url,input[0].source_url);
 assert.equal(input[0].id,undefined);
 assert.deepEqual(normalize('device','fields.timeline',value),value);
 for (const date of ['2025-02-29','2024-04-31','2025-13','2025-00','2025-01-00'])
   assert.throws(function () { normalize('device','fields.timeline',[{...input[0],date}]); }, /日期/);
 assert.throws(function () { normalize('device','fields.timeline',[{...input[0],end_date:'2023'}]); }, /结束日期/);
 assert.throws(function () { normalize('device','fields.timeline',[value[0],value[0]]); }, /不重复/);
});
test('organization categories and tagged timelines reject ambiguous types and retain sources',function(){
 assert.equal(normalizeStructuredValue('org','fields.organization_category','investment'),'investment');
 assert.throws(()=>normalizeStructuredValue('org','fields.organization_category','unknown'));
 const event={date:'2026-01',title:'投资',kind:'investment',description:'公开投资事件',source_url:'https://example.test/investment'};
 const timeline=normalizeStructuredValue('org','fields.investment_timeline',[event]);
 assert.ok(timeline[0].id);assert.equal(timeline[0].kind,'investment');
 assert.throws(()=>normalizeStructuredValue('org','fields.timeline',[{...event,date:'2026-02-30'}]));
 assert.throws(()=>normalizeStructuredValue('org','fields.timeline',[{...event,kind:'unspecified'}]));
 assert.throws(()=>normalizeStructuredValue('org','fields.timeline',[{...event,source_url:null}]));
});
