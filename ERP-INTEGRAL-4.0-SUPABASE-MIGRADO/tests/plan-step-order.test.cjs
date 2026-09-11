const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const saveSource=source.slice(source.indexOf('async function savePlanStepOrder('),source.indexOf('function wirePlanEvents('));
function fixture(overrides={}){
  const calls=[],plan={id:'plan',steps:['a','b','c'].map(id=>({id,notes:'keep',deliverables:[{done:true}]}))};
  const ctx=vm.createContext({plan,planStepOrderSave:null,syncing:false,remoteLoaded:true,canManageCore:()=>true,cacheDB:()=>calls.push('cache'),sb:{rpc:async(...args)=>{calls.push(args);return {error:null};}},...overrides});
  vm.runInContext(saveSource,ctx);
  return {ctx,calls,plan,save:ids=>ctx.savePlanStepOrder(plan,ids)};
}
test('reorders both ways with one order-only RPC and preserves step objects',async()=>{
  const f=fixture(),original=[...f.plan.steps];
  await f.save(['b','c','a']);
  assert.deepEqual([...f.plan.steps], [original[1],original[2],original[0]]);
  assert.equal(f.calls[0][0],'reorder_plan_steps');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])),{p_plan_id:'plan',p_step_ids:['b','c','a'],p_expected_ids:['a','b','c']});
  await f.save(['a','b','c']);
  assert.deepEqual([...f.plan.steps],original);
  assert.equal(f.calls.length,4);
});
test('no-op does not write or cache',async()=>{
  const f=fixture();await f.save(['a','b','c']);assert.equal(f.calls.length,0);
});
test('invalid IDs, duplicates, additions and missing steps cannot be saved',async()=>{
  for(const ids of [['a','b'],['a','b','b'],['a','b','other'],['a','b','c','d']]){
    const f=fixture();await assert.rejects(f.save(ids));assert.equal(f.calls.length,0);
  }
});
test('permissions, offline state and existing sync block order changes',async()=>{
  for(const override of [{canManageCore:()=>false},{remoteLoaded:false},{syncing:true},{planStepOrderSave:Promise.resolve()}]){
    const f=fixture(override);await assert.rejects(f.save(['b','c','a']));assert.equal(f.calls.length,0);
  }
});
test('failed request leaves local order and data untouched and releases save lock',async()=>{
  for(const rpc of [async()=>({error:new Error('denied')}),async()=>{throw new Error('offline');}]){
    const f=fixture({sb:{rpc}}),before=JSON.stringify(f.plan);
    await assert.rejects(f.save(['b','c','a']));
    assert.equal(JSON.stringify(f.plan),before);assert.equal(f.ctx.planStepOrderSave,null);
    assert.equal(f.calls.length,0);
  }
});
test('order is committed locally only after response; concurrent reorder is blocked',async()=>{
  let finish;
  const f=fixture({sb:{rpc:()=>new Promise(resolve=>finish=resolve)}});
  const pending=f.save(['c','a','b']);
  assert.deepEqual(f.plan.steps.map(s=>s.id),['a','b','c']);
  await assert.rejects(f.save(['b','a','c']));
  finish({error:null});await pending;
  assert.deepEqual([...f.plan.steps].map(s=>s.id),['c','a','b']);
  assert.equal(f.ctx.planStepOrderSave,null);
});
test('general sync waits until dedicated order save has settled',()=>{
  assert.match(source,/async function syncRemoteDB\(\)\{\s*if\(planStepOrderSave\)await planStepOrderSave\.catch\(\(\)=>\{\}\);/);
  assert.ok(source.indexOf('window.ERPPlanStepOrder?.bind')>source.indexOf('function wirePlanEvents('));
});
test('local additions, removals and edits made during a save are preserved',async()=>{
  let finish;
  const f=fixture({sb:{rpc:()=>new Promise(resolve=>finish=resolve)}});
  const pending=f.save(['c','a','b']);
  f.plan.steps=f.plan.steps.filter(s=>s.id!=='b');
  f.plan.steps[0].notes='edited';
  const added={id:'d',notes:'new',deliverables:[]};
  f.plan.steps.push(added);
  finish({error:null});await pending;
  assert.deepEqual([...f.plan.steps].map(s=>s.id),['c','a','d']);
  assert.equal(f.plan.steps[1].notes,'edited');
  assert.equal(f.plan.steps[2],added);
});
