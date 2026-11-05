import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStructuredValue as normalize} from '../src/server/encyclopedia/structured-value.ts';

test('device submissions preserve chronology, reject malformed systems and keep science JSON free',function(){
 const events=[null,'2024-02','1998'].map(function(date){return {date,title:'record',kind:'result',description:'source'};});
 assert.deepEqual(normalize('device','fields.timeline',events).map(function(row){return row.date;}),['1998','2024-02',null]);
 assert.throws(function(){normalize('device','fields.timeline',[{date:'unknown'}]);},/日期/);
 assert.throws(function(){normalize('device','fields.systems',[{name:'coil'}]);},/description/);
 assert.throws(function(){normalize('device','fields.gallery',[]);},/对象/);
 const arbitrary={any:['shape',{is:'allowed'}]};
 assert.equal(normalize('concept','fields.content',arbitrary),arbitrary);
});
