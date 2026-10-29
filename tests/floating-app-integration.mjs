import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {MessageChannel} from 'node:worker_threads';
import {IDBFactory} from 'fake-indexeddb';
import React from 'react';
import {createServer} from 'vite';

// Browser simulation with a synthetic native journal: verifies the wired web
// flow, not Chrome TWA, Android permissions or the real overlay.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://mi-ministerio-pablo.pablormlopez.chatgpt.site/',pretendToBeVisual:true});
const w=dom.window;
for(const name of ['window','document','navigator','location','HTMLElement','Element','Node','MutationObserver','NodeFilter','FormData','Event','MouseEvent','CustomEvent','getComputedStyle'])Object.defineProperty(globalThis,name,{value:w[name],configurable:true,writable:true});
globalThis.indexedDB=new IDBFactory();w.matchMedia=globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.fetch=async()=>({ok:false,status:401});globalThis.confirm=()=>true;w.confirm=globalThis.confirm;
globalThis.requestAnimationFrame=w.requestAnimationFrame.bind(w);globalThis.cancelAnimationFrame=w.cancelAnimationFrame.bind(w);
const wait=async(fn,label)=>{const end=Date.now()+16000;while(Date.now()<end){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Timeout: '+label+'; '+document.body.textContent.slice(-400));};
const button=label=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);
const click=el=>{assert.ok(el,'missing control');el.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));};
const {createRoot}=await import('react-dom/client');
const server=await createServer({configFile:'vite.config.ts',server:{middlewareMode:true},appType:'custom'});
let root,port1,port2;
try {
 const {default:App}=await server.ssrLoadModule('/app/page.tsx');
 root=createRoot(document.getElementById('root'));root.render(React.createElement(App));
 await wait(()=>document.querySelector('input[name=password]')&&button('Crear mi espacio')&&!button('Crear mi espacio').disabled,'welcome');
 document.querySelector('input[name=password]').value='only-a-test-password';document.querySelector('input[name=confirm]').value='only-a-test-password';
 if(process.env.FLOATING_PASSWORD_MODE==='1')click(document.querySelector('.unlock input[type=checkbox]'));
 document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>button('Actividad'),'unlock');
 const channel=new MessageChannel();({port1,port2}=channel);let workspace=null,timer=null,pending=null,finishing=false,lastFinished=null,endCalls=0;
 const send=msg=>port1.postMessage(JSON.stringify(msg));
 const drained=()=>{if(finishing)send({type:'finish-locked',workspace,timerId:timer.id,revision:timer.revision});else if(pending)send({type:'timer-command',workspace,command:pending});else send({type:'pending-drained',workspace});};
 port1.on('message',raw=>{
  const m=JSON.parse(raw);
  if(m.type==='web-ready')send({type:'native-ready',package:'com.pablormlopez.miministerio.testing',visible:false});
  else if(m.type==='arm-activation')send({type:'activation-armed',token:m.token});
  else if(m.type==='request-pending'){workspace=m.workspace;drained();}
  else if(m.type==='timer-snapshot'){workspace=m.workspace;timer=m.timer;send({type:'sync-ready',workspace});}
  else if(m.type==='web-command'){
   const c=m.command;if(c.action==='start'){assert.equal(timer,null);timer={id:c.timerId,revision:0,start:c.at,elapsed:0,running:true};}
   else {assert.equal(timer.id,c.timerId);assert.equal(timer.revision,c.expectedRevision);if(c.action==='pause')timer.elapsed+=c.at-timer.start;timer.start=c.at;timer.revision++;timer.running=c.action==='resume';}
   pending=c;drained();
  }else if(m.type==='timer-ack'){if(pending?.id===m.commandId){pending=null;drained();}}
  else if(m.type==='begin-finish'){assert.ok(timer&&!timer.running&&!pending);finishing=true;send({type:'finish-result',workspace,requestId:m.requestId,result:'applied'});}
  else if(m.type==='end-finish'){if(m.committed&&finishing){lastFinished=timer.id;timer=null;finishing=false;}else if(!m.committed)finishing=false;endCalls++;if(endCalls!==1)send({type:'finish-result',workspace,requestId:m.requestId,result:!m.committed||lastFinished===m.timerId?'applied':'conflict'});}
  else if(m.type==='disable-floating'){assert.equal(timer,null);send({type:'disable-result',workspace,requestId:m.requestId,result:'applied'});}
 });
 port1.postMessage('mi-ministerio-floating-v1');
 w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,ports:[port2]}));
 click(button('Actividad'));
 await wait(()=>button('Activar cronómetro flotante')&&!button('Activar cronómetro flotante').disabled,'connected');
 click(button('Activar cronómetro flotante'));
 await wait(()=>document.querySelector('a[href^="intent:"]'),'activation prepared');
 if(process.env.FLOATING_PASSWORD_MODE==='1'){
  Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new w.Event('visibilitychange'));
  await wait(()=>document.querySelector('input[name=password]'),'lock while requesting permission');
  send({type:'overlay-enabled'});Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new w.Event('visibilitychange'));
  document.querySelector('input[name=password]').value='only-a-test-password';document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>button('Actividad'),'unlock after permission');click(button('Actividad'));
 }else send({type:'overlay-enabled'});
 await wait(()=>document.body.textContent.includes('Ventana visible')&&button('Desactivar')&&!button('Desactivar').disabled,'overlay event and sync');
 const start=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Iniciar')&&x.closest('.timer-card'));
 click(start);await wait(()=>timer?.running&&document.querySelector('.timer-card')?.textContent.includes('Pausar')&&button('Desactivar')&&!button('Desactivar').disabled,'start and sync');
 // Simulate an overlay-originated pause and resume; both must reach the same web timer.
 const nativeAction=action=>{const at=Date.now(),command={id:crypto.randomUUID(),timerId:timer.id,expectedRevision:timer.revision,at,action};if(action==='pause')timer.elapsed+=at-timer.start;timer.start=at;timer.revision++;timer.running=action==='resume';pending=command;drained();};
 nativeAction('pause');await wait(()=>!pending&&button('Reanudar')&&button('Desactivar')&&!button('Desactivar').disabled,'native pause');
 nativeAction('resume');await wait(()=>!pending&&button('Pausar')&&button('Desactivar')&&!button('Desactivar').disabled,'native resume');
 const finish=[...document.querySelectorAll('.timer-card button')].find(x=>x.textContent.includes('Finalizar'));
 click(finish);await wait(()=>document.querySelector('[role=dialog] form'),'finish form');
 const dialog=document.querySelector('[role=dialog] form');dialog.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>lastFinished&&!timer&&!document.querySelector('[role=dialog] form'),'finish commit');
 const vault=await server.ssrLoadModule('/lib/ministerio/vault.ts');const cache=await vault.readCache();const access=await vault.readDeviceAccess();const key=access.key||await vault.derive('only-a-test-password',cache.payload.salt);const state=await vault.unseal(cache.payload,key);
 assert.equal(state.activities.length,1);assert.equal(state.activities[0].timerId,lastFinished);
 const firstFinished=lastFinished;
 await wait(()=>endCalls>=2&&button('Desactivar')&&!button('Desactivar').disabled,'lost finish acknowledgement recovery');
 click([...document.querySelectorAll('.timer-card button')].find(x=>x.textContent.includes('Iniciar')));
 await wait(()=>timer?.running&&button('Desactivar')&&!button('Desactivar').disabled,'second timer');
 click([...document.querySelectorAll('.timer-card button')].find(x=>x.textContent.includes('Cancelar')));
 await wait(()=>lastFinished!==firstFinished&&!timer&&button('Desactivar')&&!button('Desactivar').disabled,'discard');
 const after=await vault.unseal((await vault.readCache()).payload,key);assert.equal(after.activities.length,1);assert.equal(after.timer,null);
 click(button('Desactivar'));await wait(()=>button('Activar cronómetro flotante'),'disabled');
 console.log('PASS: simulated TWA flow ('+(process.env.FLOATING_PASSWORD_MODE==='1'?'password lock':'direct access')+') activates, synchronizes, recovers a lost ACK, saves once, discards and disables.');
} finally {root?.unmount();port1?.close();port2?.close();await server.close();w.close();}
