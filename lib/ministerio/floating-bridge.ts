/**
 * Web end of the TWA postMessage channel. It does not grant Android permissions,
 * persist state, or decide whether a timer command is safe to acknowledge.
 * The native application must establish a Digital Asset Links-validated channel
 * to the exact page origin and send the handshake with its MessagePort.
 */
export const FLOATING_HANDSHAKE = 'mi-ministerio-floating-v1';
const MAX_MESSAGE_CHARS = 4096;
type FloatingMessage = {type:string;[key:string]:unknown};
type BridgeOptions = {
 target: Pick<Window,'addEventListener'|'removeEventListener'>;
 origin: string;
 onMessage:(message:FloatingMessage)=>void;
 onConnectionChange?:(connected:boolean)=>void;
};

export function createFloatingBridge({target,origin,onMessage,onConnectionChange}:BridgeOptions) {
 let current:MessagePort|null=null;
 let disposed=false;
 function disconnect() {
  if(!current)return;
  const port=current;current=null;port.onmessage=null;port.onmessageerror=null;port.close();
  onConnectionChange?.(false);
 }
 function handleHandshake(raw:Event) {
  const event=raw as MessageEvent;
  if(disposed || event.origin!==origin || event.data!==FLOATING_HANDSHAKE || event.ports.length!==1)return;
  // Navigation and reconnects replace the channel; old ports must not keep sending.
  disconnect();
  const port=event.ports[0];current=port;
  port.onmessage=(incoming:MessageEvent)=>{
   if(disposed||current!==port||typeof incoming.data!=='string'||incoming.data.length>MAX_MESSAGE_CHARS)return;
   try {
    const message=JSON.parse(incoming.data);
    if(!message||typeof message!=='object'||Array.isArray(message)||typeof message.type!=='string'||message.type.length>64)return;
    onMessage(message);
   } catch { /* malformed messages are ignored */ }
  };
  port.onmessageerror=()=>{if(current===port)disconnect();};
  port.start();onConnectionChange?.(true);
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
  dispose(){if(disposed)return;disposed=true;target.removeEventListener('message',handleHandshake);disconnect();},
 };
}
