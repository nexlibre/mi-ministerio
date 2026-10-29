export const roles=['Publicador','Precursor auxiliar','Precursor regular','Precursor especial'];
export const kinds=['Casa en casa','Predicación informal','Predicación pública','Predicación telefónica','Videollamada','Revisita','Estudio bíblico','Otra actividad'];
export const statuses=['Nueva persona','Interesada','Revisita','Estudio bíblico','Contacto ocasional','Pendiente','Archivada'];
export type RecordItem={id:string;createdAt:string;updatedAt:string;[key:string]:any};
export type State={version:1;profile:Record<string,any>;appointments:RecordItem[];activities:RecordItem[];people:RecordItem[];conversations:RecordItem[];events:RecordItem[];goals:RecordItem[];notes:RecordItem[];readings:RecordItem[];reports:RecordItem[];timer:null|{id?:string;revision?:number;recentCommands?:{id:string;revision:number;action:'start'|'pause'|'resume';at:number}[];start:number;startedAt?:number;elapsed:number;running:boolean;kind:string;date:string};schedule:Record<string,string>;reading:Record<string,any>};
export const today=()=>new Date().toLocaleDateString('en-CA');
export const monthNow=()=>today().slice(0,7);
export function initial():State{return {version:1,profile:{name:'',preferred:'',role:'Publicador',theme:'system',hours:50,studies:5,visits:15,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,showGoals:true,showReading:true},appointments:[],activities:[],people:[],conversations:[],events:[],goals:[],notes:[],readings:[],reports:[],timer:null,schedule:{},reading:{book:'Génesis',chapter:1,daily:1,time:'19:00'}};}
export function record(value:Record<string,any>):RecordItem {return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...value};}
export function metrics(s:State,month:string){const a=s.activities.filter(x=>x.date?.startsWith(month));const reportable=a.filter(x=>x.reportable);return {minutes:reportable.reduce((v,x)=>v+Number(x.minutes||0),0),studies:new Set(reportable.filter(x=>x.kind==='Estudio bíblico'&&x.person).map(x=>x.person)).size,visits:a.filter(x=>x.kind==='Revisita').length,conversations:a.filter(x=>x.kind==='Predicación informal').length,days:new Set(a.map(x=>x.date)).size,participated:reportable.length>0,activities:a};}
export const duration=(minutes:number)=>`${Math.floor(minutes/60)} h ${Math.floor(minutes%60).toString().padStart(2,'0')} min`;
export function elapsed(timer:NonNullable<State['timer']>,now=Date.now()){return timer.elapsed+(timer.running?Math.max(0,now-timer.start):0);}
// The form may remain open while the timer changes. Never clear a different or
// resumed timer, and never append a second record on a repeated submission.
export function finishTimedActivity(state:State,timerId:string,item:RecordItem,expectedRevision?:number):State {
 if(!state.timer||state.timer.id!==timerId||state.timer.running||(expectedRevision!==undefined&&(state.timer.revision??0)!==expectedRevision))throw Error('El cronómetro cambió. Vuelve a finalizar la actividad.');
 if(state.activities.some(activity=>activity.timerId===timerId))throw Error('Esta actividad ya se guardó.');
 return {...state,timer:null,activities:[...state.activities,{...item,timerId}]};
}
export function roleAt(s:State,month:string){const history=[...s.appointments].filter(x=>x.date<=month+'-31').sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));return history[0]?.role||'Publicador';}
export function validateState(x:any):x is State{return x?.version===1&&typeof x.profile?.name==='string'&&roles.includes(x.profile.role)&&['activities','people','events','conversations','goals','notes','readings','reports','appointments'].every(k=>Array.isArray(x[k])&&x[k].every((v:any)=>typeof v.id==='string'))&&typeof x.schedule==='object'&&x.reading;}
export const monthLabel=(m:string)=>new Date(m+'-15T12:00:00').toLocaleDateString('es',{month:'long',year:'numeric'});
