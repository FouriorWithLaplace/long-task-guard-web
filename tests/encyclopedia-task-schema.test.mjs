import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileTaskSchema} from '../src/server/encyclopedia/task-schema.ts';

test('schema changes preserve unchanged verified fields and invalidate transformed completion',function(){
 const task={dictionaryHash:'old',scope:['fields.title','fields.timeline','fields.retired'],processedFields:['fields.title','fields.timeline','fields.retired'],results:{'fields.title':{value:'Title',readback:true},'fields.timeline':{value:'old prose',readback:true},'fields.retired':{value:true,readback:true}},runId:'old',skillHash:'old',phase:'completed',desired:'stopped',slotHeld:false};
 const detail={dictionaryHash:'new',fields:[{key:'fields.title',writable:true,value:'Title'},{key:'fields.timeline',writable:true,value:[{date:'2020'}]},{key:'fields.gallery',writable:true,value:null}]};
 assert.equal(reconcileTaskSchema(task,detail),true);
 assert.deepEqual(task.processedFields,['fields.title']);
 assert.deepEqual(task.scope,['fields.title','fields.timeline','fields.gallery']);
 assert.equal(task.phase,'stopped');
 assert.notEqual(task.runId,'old');
 assert.equal(task.skillHash,'');
 assert.equal(task.results['fields.retired'].value,true);
 assert.equal(reconcileTaskSchema(task,detail),false);
});

test('changed collection rules invalidate confirmation even when the stored value is unchanged', function () {
 const task = {dictionaryHash:'old',scope:['fields.authors','fields.title'],processedFields:['fields.authors','fields.title'],results:{'fields.authors':{value:'A',readback:true},'fields.title':{value:'T',readback:true}},phase:'completed',desired:'stopped'};
 const detail = {dictionaryHash:'new',fields:[{key:'fields.authors',writable:true,value:'A'},{key:'fields.title',writable:true,value:'T'}]};
 reconcileTaskSchema(task, detail, new Set(['fields.authors']));
 assert.deepEqual(task.processedFields,['fields.title']);
 assert.equal(task.phase,'stopped');
 assert.equal(task.results['fields.authors'].value,'A');
});
