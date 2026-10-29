import ts from 'typescript';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
const src=await fs.readFile('lib/ministerio/floating-bridge.ts','utf8');
const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createFloatingBridge,FLOATING_HANDSHAKE}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
class Target {
 listener=null;
 addEventListener(type,fn){assert.equal(type,'message');this.listener=fn;}
 removeEventListener(type,fn){assert.equal(type,'message');if(this.listener===fn)this.listener=null;}
 emit(e){this.listener?.(e);}
}
class Port {
 onmessage=null;onmessageerror=null;closed=false;sent=[];started=false;
 start(){this.started=true;} close(){this.closed=true;} postMessage(x){this.sent.push(x);}
 emit(data){this.onmessage?.({data});}
}
const target=new Target(), messages=[], changes=[];
const bridge=createFloatingBridge({target,origin:'https://app.example',onMessage:m=>messages.push(m),onConnectionChange:x=>changes.push(x)});
const first=new Port();
// Chrome transfers the port in a window message; the greeting comes later on
// that port, not in event.data. Reproduce the protocol used by Android.
const transfer=(origin,port,data='')=>target.emit({origin,data,ports:[port]});
transfer('https://untrusted.example',first);assert.equal(bridge.connected,false);
transfer('https://app.example',first,'browser-created-port');assert.equal(bridge.connected,false);assert.equal(first.started,true);
first.emit(FLOATING_HANDSHAKE);assert.equal(bridge.connected,true);
first.emit('not-json');first.emit(JSON.stringify({}));first.emit(JSON.stringify({type:'x'.repeat(65)}));first.emit('x'.repeat(4097));
assert.deepEqual(messages,[]);
first.emit(JSON.stringify({type:'timer',revision:1}));assert.deepEqual(messages,[{type:'timer',revision:1}]);
assert.equal(bridge.send({type:'ack',revision:1}),true);assert.deepEqual(JSON.parse(first.sent[0]),{type:'ack',revision:1});
const invalid=new Port();transfer('https://app.example',invalid);invalid.emit('wrong');assert.equal(invalid.closed,true);assert.equal(bridge.connected,true);
const second=new Port();transfer('https://app.example',second);assert.equal(first.closed,false);second.emit(FLOATING_HANDSHAKE);assert.equal(first.closed,true);
first.emit(JSON.stringify({type:'old'}));second.emit(JSON.stringify({type:'new'}));assert.equal(messages.length,2);assert.equal(messages[1].type,'new');
second.onmessageerror();assert.equal(second.closed,true);assert.equal(bridge.connected,false);assert.equal(bridge.send({type:'ack'}),false);
assert.deepEqual(changes,[true,false,true,false]);
const pending=new Port();transfer('https://app.example',pending);bridge.dispose();assert.equal(pending.closed,true);assert.equal(target.listener,null);
// Exercise asynchronous delivery with real MessagePorts, including the native
// greeting queued before JavaScript handles the transferred-port event.
const actualTarget=new Target(), actualMessages=[], actualChanges=[];
let delivered;const delivery=new Promise(resolve=>{delivered=resolve;});
const actual=createFloatingBridge({target:actualTarget,origin:'https://app.example',onMessage:m=>{actualMessages.push(m);delivered();},onConnectionChange:x=>actualChanges.push(x)});
const {port1,port2}=new MessageChannel();
port1.postMessage(FLOATING_HANDSHAKE);port1.postMessage(JSON.stringify({type:'native-ready'}));
actualTarget.emit({origin:'https://app.example',data:'',ports:[port2]});
let timeoutId;try {await Promise.race([delivery,new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(Error('MessageChannel greeting timed out')),2000);})]);} finally {clearTimeout(timeoutId);}
assert.equal(actual.connected,true);assert.deepEqual(actualMessages,[{type:'native-ready'}]);assert.deepEqual(actualChanges,[true]);
const received=new Promise(resolve=>port1.once('message',resolve));assert.equal(actual.send({type:'web-ready'}),true);
assert.deepEqual(JSON.parse(await received),{type:'web-ready'});actual.dispose();port1.close();
console.log('PASS: bridge port-transfer greeting, real MessageChannel, origin and payload checks, replacement, error and disposal.');
