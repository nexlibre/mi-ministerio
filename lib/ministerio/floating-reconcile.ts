import {kinds, type State} from './model';
import {applyTimerCommand, type TimerCommand} from './timer-sync';

type Result = {status:'ack';commandId:string;revision:number} | {status:'locked'|'conflict'|'storage-error'};
type Options = {
 workspace:string;
 command:unknown;
 current:()=>State|null;
 /** Must persist the supplied complete state before returning true. */
 persist:(next:State)=>Promise<boolean>;
};

/**
 * Reconcile one native command. Callers must serialize invocations and prevent
 * unrelated workspace replacement until the returned promise has settled.
 * Never acknowledge a command merely because it was applied in memory.
 */
export async function reconcileFloatingCommand({workspace,command,current,persist}:Options):Promise<Result> {
 const state=current();
 if(!state)return {status:'locked'};
 if(typeof workspace!=='string'||!workspace||workspace.length>128||state.profile.floatingWorkspaceId!==workspace)return {status:'conflict'};
 if(!command||typeof command!=='object'||Array.isArray(command))return {status:'conflict'};
 const c=command as Omit<TimerCommand,'action'> & {action:'start'|'pause'|'resume'};
 if(typeof c.id!=='string'||!c.id||c.id.length>128||typeof c.timerId!=='string'||!c.timerId||c.timerId.length>128 ||
    !Number.isSafeInteger(c.expectedRevision)||!Number.isSafeInteger(c.at)||c.at<0||
    (c.action!=='start'&&c.action!=='pause'&&c.action!=='resume') ||
    (c.action==='start'?c.expectedRevision!==-1:c.expectedRevision<0))return {status:'conflict'};
 let next:State;
 if(c.action==='start') {
  if(state.activities.some(activity=>activity.timerId===c.timerId))return {status:'conflict'};
  const prior=state.timer?.recentCommands?.find(x=>x.id===c.id);
  if(state.timer){
   if(state.timer.id!==c.timerId||!prior||prior.action!=='start'||prior.revision!==-1||prior.at!==c.at)return {status:'conflict'};
   next=state; // A prior save may have failed, so persist the duplicate again.
  } else {
   const started=new Date(c.at);
   if(!Number.isFinite(started.getTime()))return {status:'conflict'};
   next={...state,timer:{id:c.timerId,revision:0,start:c.at,startedAt:c.at,elapsed:0,running:true,kind:kinds[0],date:started.toLocaleDateString('en-CA'),recentCommands:[{id:c.id,revision:-1,action:'start',at:c.at}]}};
  }
 } else {
  if(!state.timer)return {status:'conflict'};
  const result=applyTimerCommand(state.timer,c as TimerCommand);
  if(result.status==='conflict')return {status:'conflict'};
  // A duplicate may only be in memory after an earlier failed save; persist it again.
  next=result.status==='applied'?{...state,timer:result.timer}:state;
 }
 try {if(!await persist(next))return {status:'storage-error'};} catch {return {status:'storage-error'};}
 const after=current();
 if(!after)return {status:'locked'};
 if(after!==next||after.profile.floatingWorkspaceId!==workspace||!after.timer||after.timer.id!==c.timerId)return {status:'conflict'};
 const applied=after.timer.recentCommands?.find(x=>x.id===c.id);
 if(!applied || applied.revision!==c.expectedRevision || applied.at!==c.at || applied.action!==c.action)return {status:'conflict'};
 return {status:'ack',commandId:c.id,revision:c.expectedRevision+1};
}
