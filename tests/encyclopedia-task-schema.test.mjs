import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileTaskSchema} from '../src/server/encyclopedia/task-schema.ts';
import {fieldProgress, taskProgress} from '../src/types/encyclopedia.ts';

test('program fields stay pending until database results exist; zero and false are completed results', function () {
 const fields = [
  {key:'fields.title',writable:true,value:'Title'},
  {key:'fields.score',storage:'fields',writable:false,rules:{collection_mode:'system'},value:null},
  {key:'fields.count',storage:'fields',writable:false,rules:{collection_mode:'system'},value:0},
  {key:'fields.flag',storage:'fields',writable:false,rules:{collection_mode:'system'},value:false},
  {key:'identity.entity_id',storage:'identity',writable:false,rules:{collection_mode:'system'},value:1},
 ];
 const task={dictionaryHash:'same',scope:['fields.title'],processedFields:['fields.title'],results:{'fields.title':{value:'Title',readback:true}},phase:'completed',desired:'stopped'};
 reconcileTaskSchema(task,{dictionaryHash:'same',fields});
 assert.equal(task.phase,'stopped');
 assert.deepEqual(task.scope,['fields.title','fields.score','fields.count','fields.flag']);
 assert.deepEqual(fieldProgress(fields,task),{filled:3,checked:3,total:4,percent:75});
 assert.equal(taskProgress(task).checked,3);
 assert.equal(taskProgress(task).total,4);
 assert.equal(reconcileTaskSchema(task,{dictionaryHash:'same',fields}),false);
 fields[1].value=0;
 assert.equal(reconcileTaskSchema(task,{dictionaryHash:'same',fields}),true);
 assert.equal(taskProgress(task).percent,100);
 assert.equal(task.phase,'completed');
});

test('database value changes invalidate confirmations even when dictionary hash stays the same', function () {
 const task={dictionaryHash:'same',scope:['fields.title'],processedFields:['fields.title'],results:{'fields.title':{value:'Old',readback:true}},phase:'completed',desired:'stopped'};
 const detail={dictionaryHash:'same',fields:[{key:'fields.title',writable:true,value:'New'}]};
 assert.equal(reconcileTaskSchema(task,detail),true);
 assert.deepEqual(task.processedFields,[]);
 assert.equal(task.phase,'stopped');
 assert.equal(task.results['fields.title'].value,'Old');
});

test('new field rules invalidate only the affected confirmation and preserve unrelated results', function () {
 const fields=[{key:'fields.title',writable:true,value:'Title',rules:{collection_mode:'evidence_required',description:'Original rule'}},{key:'fields.notes',writable:true,value:null,rules:{collection_mode:'evidence_required'}}];
 const task={dictionaryHash:'old',scope:['fields.title','fields.notes'],processedFields:['fields.title','fields.notes'],results:{'fields.title':{value:'Title',readback:true},'fields.notes':{value:null,readback:true}},phase:'completed',desired:'stopped'};
 reconcileTaskSchema(task,{dictionaryHash:'old',fields});
 fields[0].rules.description='Changed evidence requirement';
 reconcileTaskSchema(task,{dictionaryHash:'new',fields});
 assert.deepEqual(task.processedFields,['fields.notes']);
 assert.equal(task.phase,'stopped');
 assert.equal(task.results['fields.title'].value,'Title');
});

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
