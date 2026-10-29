import ts from 'typescript';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
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
const handshake=(origin,port,data=FLOATING_HANDSHAKE)=>target.emit({origin,data,ports:[port]});
handshake('https://untrusted.example',first);assert.equal(bridge.connected,false);
handshake('https://app.example',first,'wrong');assert.equal(bridge.connected,false);
handshake('https://app.example',first);assert.equal(bridge.connected,true);assert.equal(first.started,true);
first.emit('not-json');first.emit(JSON.stringify({}));first.emit(JSON.stringify({type:'x'.repeat(65)}));first.emit('x'.repeat(4097));
assert.deepEqual(messages,[]);
first.emit(JSON.stringify({type:'timer',revision:1}));assert.deepEqual(messages,[{type:'timer',revision:1}]);
assert.equal(bridge.send({type:'ack',revision:1}),true);assert.deepEqual(JSON.parse(first.sent[0]),{type:'ack',revision:1});
const second=new Port();handshake('https://app.example',second);assert.equal(first.closed,true);
first.emit(JSON.stringify({type:'old'}));second.emit(JSON.stringify({type:'new'}));assert.equal(messages.length,2);assert.equal(messages[1].type,'new');
second.onmessageerror();assert.equal(second.closed,true);assert.equal(bridge.connected,false);assert.equal(bridge.send({type:'ack'}),false);
assert.deepEqual(changes,[true,false,true,false]);
bridge.dispose();assert.equal(target.listener,null);
console.log('PASS: bridge origin and payload checks, port replacement, error and disposal.');
