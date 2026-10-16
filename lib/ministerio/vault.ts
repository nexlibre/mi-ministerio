import {State,validateState} from './model';
export type Envelope={v:1;salt:string;iv:string;cipher:string};
export type Cache={owner:string;revision:number;payload:Envelope;dirty:boolean};
const b64=(x:Uint8Array)=>btoa(Array.from(x,n=>String.fromCharCode(n)).join(''));
const bytes=(x:string)=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
export async function derive(password:string,salt:string){const source=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(salt),iterations:310000,hash:'SHA-256'},source,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export const salt=()=>b64(crypto.getRandomValues(new Uint8Array(16)));
export async function seal(state:State,key:CryptoKey,salt:string):Promise<Envelope>{const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(state)));return {v:1,salt,iv:b64(iv),cipher:b64(new Uint8Array(cipher))};}
export async function unseal(payload:Envelope,key:CryptoKey):Promise<State>{const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv)},key,bytes(payload.cipher));const state=JSON.parse(new TextDecoder().decode(raw));if(!validateState(state))throw Error('Invalid backup');return state;}
async function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('ministerio-secure',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readCache():Promise<Cache|null>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('vault').objectStore('vault').get('current');r.onsuccess=()=>{resolve(r.result||null);d.close();};r.onerror=()=>reject(r.error);});}
export async function writeCache(value:Cache|null){const d=await db();return new Promise<void>((resolve,reject)=>{const t=d.transaction('vault','readwrite');value?t.objectStore('vault').put(value,'current'):t.objectStore('vault').delete('current');t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);});}
export async function remote():Promise<{owner:string;revision:number;payload:Envelope|null}>{const r=await fetch('/api/vault',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error(r.status===401?'Inicia sesión para conectar tu copia.':'No se pudo conectar.');return r.json() as Promise<{owner:string;revision:number;payload:Envelope|null}>;}
export async function push(cache:Cache){const r=await fetch('/api/vault',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:cache.revision,payload:cache.payload})});if(r.status===409)throw Error('CONFLICT');if(!r.ok)throw Error('OFFLINE');return (await r.json() as {revision:number}).revision;}

// This device-only record is never included in backups or sent to the server.
// IndexedDB can structured-clone a non-extractable CryptoKey without saving the password.
export type DeviceAccess = {
  owner: string;
  requirePassword: boolean;
  salt?: string;
  key?: CryptoKey;
};
export function matchesDeviceAccess(access: DeviceAccess | null, cache: Cache) {
  return !!access && !access.requirePassword && access.owner === cache.owner
    && access.salt === cache.payload.salt && !!access.key
    && access.key.type === 'secret' && access.key.extractable === false
    && access.key.algorithm.name === 'AES-GCM';
}
export async function readDeviceAccess(): Promise<DeviceAccess | null> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('vault');
    const request = tx.objectStore('vault').get('device-access');
    tx.oncomplete = () => { d.close(); resolve(request.result || null); };
    tx.onabort = tx.onerror = () => { d.close(); reject(tx.error); };
  });
}
export async function writeDeviceAccess(value: DeviceAccess | null) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction('vault', 'readwrite');
    const store = tx.objectStore('vault');
    if (value) {
      // Password-required mode must remove the persisted decryption key entirely.
      const record = value.requirePassword
        ? { owner: value.owner, requirePassword: true } : value;
      store.put(record, 'device-access');
    } else store.delete('device-access');
    tx.oncomplete = () => { d.close(); resolve(); };
    tx.onabort = tx.onerror = () => { d.close(); reject(tx.error); };
  });
}

// A local identity is scoped to this encrypted device cache, never a server credential.
export const isLocalOwner = (owner: string) => owner.startsWith('local:');
export async function openWorkspace(): Promise<{owner:string;cache:Cache|null}> {
 const local = await readCache();
 // Never replace local data with an unrelated browser account.
 if(local) return {owner:local.owner,cache:local};
 // Preserve an existing signed-in user's encrypted copy without requiring sign-in.
 try {
  const r = await remote();
  if(r.payload) return {owner:r.owner,cache:{owner:r.owner,revision:r.revision,payload:r.payload,dirty:false}};
 } catch { /* First use works offline, with no external account. */ }
 return {owner:'local:'+crypto.randomUUID(),cache:null};
}
