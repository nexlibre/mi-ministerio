import ts from 'typescript';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const load=async(path,replacements=[])=>{let s=await fs.readFile(path,'utf8');for(const [a,b] of replacements)s=s.replaceAll(a,b);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');};
const model=await load('lib/ministerio/model.ts');const M=await import(model);
const timer=await load('lib/ministerio/timer-sync.ts',[["'./model'",JSON.stringify(model)]]);
const R=await import(await load('lib/ministerio/floating-reconcile.ts',[["'./model'",JSON.stringify(model)],["'./timer-sync'",JSON.stringify(timer)]]));
let state={...M.initial(),profile:{...M.initial().profile,floatingWorkspaceId:'workspace'},timer:{id:'timer',revision:0,start:1000,elapsed:0,running:true,kind:'Otra actividad',date:'2026-01-01'}};
const cmd={id:'c1',timerId:'timer',expectedRevision:0,at:3000,action:'pause'};
let saved=null,fail=true;
const persist=async next=>{state=next;if(fail)return false;saved=structuredClone(next);return true;};
const run=(command=cmd,workspace='workspace')=>R.reconcileFloatingCommand({workspace,command,current:()=>state,persist});
assert.equal((await run()).status,'storage-error');assert.equal(state.timer.elapsed,2000);assert.equal(saved,null);
fail=false;assert.deepEqual(await run(),{status:'ack',commandId:'c1',revision:1});assert.equal(saved.timer.elapsed,2000);
assert.equal((await run({...cmd,id:'c2'})).status,'conflict');
assert.equal((await run(cmd,'other')).status,'conflict');
assert.equal((await run({...cmd,id:'x'.repeat(129)})).status,'conflict');
state=saved;const resume={id:'c2',timerId:'timer',expectedRevision:1,at:5000,action:'resume'};
const pending=R.reconcileFloatingCommand({workspace:'workspace',command:resume,current:()=>state,persist:async next=>{state=next;saved=structuredClone(next);state=null;return true;}});
assert.equal((await pending).status,'locked');state=saved;assert.deepEqual(await run(resume),{status:'ack',commandId:'c2',revision:2});
state=null;assert.equal((await run()).status,'locked');
// A later write or restore during persistence must not be acknowledged.
state=saved;const c3={id:'c3',timerId:'timer',expectedRevision:2,at:8000,action:'pause'};
assert.equal((await R.reconcileFloatingCommand({workspace:'workspace',command:c3,current:()=>state,persist:async next=>{state={...next,profile:{...next.profile,name:'changed'}};return true;}})).status,'conflict');
// Exercise the encrypted IndexedDB path with synthetic data, not a simulated plaintext save.
const fake=await import('fake-indexeddb');globalThis.indexedDB=new fake.IDBFactory();
const V=await import(await load('lib/ministerio/vault.ts',[["'./model'",JSON.stringify(model)]]));
const salt=V.salt(),key=await V.derive('only-a-test-password',salt);state=saved;
const encryptedResult=await R.reconcileFloatingCommand({workspace:'workspace',command:c3,current:()=>state,persist:async next=>{
 state=next;const payload=await V.seal(next,key,salt);await V.writeCache({owner:'local:test',revision:0,dirty:true,payload});return true;
}});
assert.equal(encryptedResult.status,'ack');const envelope=(await V.readCache()).payload;
assert.ok(!JSON.stringify(envelope).includes('workspace'));const recovered=await V.unseal(envelope,key);
assert.equal(recovered.timer.recentCommands.at(-1).id,'c3');assert.equal(recovered.timer.elapsed,5000);
console.log('PASS: command reconciliation persists encrypted state before acknowledgement and rejects stale workspaces, locks and concurrent replacement.');
