/**
 * Web end of the TWA postMessage channel. The browser transfers a MessagePort
 * in a window message; subsequent messages from Android arrive on that port.
 * The native application validates Digital Asset Links and sends the protocol
 * greeting on the port before any application messages.
 */
export const FLOATING_HANDSHAKE = 'mi-ministerio-floating-v1';
const MAX_MESSAGE_CHARS = 4096;
const HANDSHAKE_TIMEOUT_MS = 10000;
type FloatingMessage = {type:string;[key:string]:unknown};
type BridgeOptions = {
 target: Pick<Window,'addEventListener'|'removeEventListener'>;
 origin: string;
 onMessage:(message:FloatingMessage)=>void;
 onConnectionChange?:(connected:boolean)=>void;
};

export function createFloatingBridge({target,origin,onMessage,onConnectionChange}:BridgeOptions) {
 let current:MessagePort|null=null;
 let candidate:MessagePort|null=null;
 let timeout:ReturnType<typeof setTimeout>|null=null;
 let disposed=false;
 function closeCandidate() {
  if(timeout!==null){clearTimeout(timeout);timeout=null;}
  if(!candidate)return;
  const port=candidate;candidate=null;port.onmessage=null;port.onmessageerror=null;port.close();
 }
 function disconnect() {
  if(!current)return;
  const port=current;current=null;port.onmessage=null;port.onmessageerror=null;port.close();
  onConnectionChange?.(false);
 }
 function handleHandshake(raw:Event) {
  const event=raw as MessageEvent;
  if(disposed || event.origin!==origin || event.ports.length!==1)return;
  // The port transfer and the Android greeting are separate messages. Requiring
  // event.data to be the greeting would discard the actual Chrome TWA channel.
  closeCandidate();
  const port=event.ports[0];candidate=port;
  port.onmessage=(incoming:MessageEvent)=>{
   if(disposed||candidate!==port)return;
   if(incoming.data!==FLOATING_HANDSHAKE){closeCandidate();return;}
   if(timeout!==null){clearTimeout(timeout);timeout=null;}
   candidate=null;disconnect();current=port;
   port.onmessage=(next:MessageEvent)=>{
    if(disposed||current!==port||typeof next.data!=='string'||next.data.length>MAX_MESSAGE_CHARS)return;
    try {
     const message=JSON.parse(next.data);
     if(!message||typeof message!=='object'||Array.isArray(message)||typeof message.type!=='string'||message.type.length>64)return;
     onMessage(message);
    } catch { /* malformed messages are ignored */ }
   };
   port.onmessageerror=()=>{if(current===port)disconnect();};
   onConnectionChange?.(true);
  };
  port.onmessageerror=()=>{if(candidate===port)closeCandidate();};
  timeout=setTimeout(()=>{if(candidate===port)closeCandidate();},HANDSHAKE_TIMEOUT_MS);
  port.start();
 }
 target.addEventListener('message',handleHandshake);
 return {
  get connected(){return current!==null;},
  send(message:FloatingMessage) {
   if(!current||disposed)return false;
   let payload:string;
   try {payload=JSON.stringify(message);} catch {return false;}
   if(typeof payload!=='string'||payload.length>MAX_MESSAGE_CHARS)return false;
   try {current.postMessage(payload);return true;} catch {disconnect();return false;}
  },
  dispose(){if(disposed)return;disposed=true;target.removeEventListener('message',handleHandshake);closeCandidate();disconnect();},
 };
}
