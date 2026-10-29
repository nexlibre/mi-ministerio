import {finishTimedActivity, type RecordItem, type State} from './model';

type Result = {status:'committed';activityId:string} | {status:'locked'|'conflict'|'storage-error'};
type Options = {
 workspace:string;
 timerId:string;
 revision:number;
 activity:RecordItem;
 current:()=>State|null;
 persist:(state:State)=>Promise<boolean>;
};

/**
 * Called only after native has durably frozen the same paused timer revision.
 * Persist before telling native to release its finish lock. Retrying never
 * appends a second activity. Callers serialize this against all workspace
 * changes and verify the native lock/ack for the same request.
 */
export async function commitFloatingFinish({workspace,timerId,revision,activity,current,persist}:Options):Promise<Result> {
 const state=current();
 if(!state)return {status:'locked'};
 if(!workspace||workspace.length>128||state.profile.floatingWorkspaceId!==workspace||!timerId||timerId.length>128||
    !Number.isSafeInteger(revision)||revision<0||!activity||typeof activity.id!=='string'||!activity.id)return {status:'conflict'};
 // A second finalization must not overwrite a receipt whose native ACK may
 // have been lost. It has to be reconciled before another timer can finish.
 const pending=state.profile.floatingPendingFinish;
 if(pending&&(pending.workspace!==workspace||pending.timerId!==timerId||pending.revision!==revision||pending.discarded===true))return {status:'conflict'};
 let next:State,activityId:string;
 const existing=state.activities.filter(item=>item.timerId===timerId);
 if(existing.length>1)return {status:'conflict'};
 if(existing.length===1){
  if(state.timer)return {status:'conflict'};
  next=state;activityId=existing[0].id;
 }else{
  try {next=finishTimedActivity(state,timerId,activity,revision);} catch {return {status:'conflict'};}
  activityId=activity.id;
 }
 // Persist the native finish receipt in the same encrypted transaction as the
 // activity, so a lost channel/process can safely resend end-finish on unlock.
 next={...next,profile:{...next.profile,floatingPendingFinish:{workspace,timerId,revision}}};
 try {if(!await persist(next))return {status:'storage-error'};} catch {return {status:'storage-error'};}
 const after=current();
 if(!after)return {status:'locked'};
 if(after!==next||after.profile.floatingWorkspaceId!==workspace||after.timer||
    after.activities.filter(item=>item.timerId===timerId).length!==1||
    !after.activities.some(item=>item.timerId===timerId&&item.id===activityId))return {status:'conflict'};
 return {status:'committed',activityId};
}

/**
 * Discard uses the same native freeze/commit protocol as finalization. Once
 * the tombstone has been durably saved, native can endFinish(committed=true):
 * "committed" means the web has recorded a terminal outcome, not necessarily
 * that it created an activity. The receipt survives a lost native reply.
 * Never use timer-clear before this transaction has completed.
 */
export async function commitFloatingDiscard({workspace,timerId,revision,current,persist}:Omit<Options,'activity'>):Promise<{status:'committed'|'locked'|'conflict'|'storage-error'}> {
 const state=current();
 if(!state)return {status:'locked'};
 if(!workspace||workspace.length>128||state.profile.floatingWorkspaceId!==workspace||!timerId||timerId.length>128||
    !Number.isSafeInteger(revision)||revision<0)return {status:'conflict'};
 const pending=state.profile.floatingPendingFinish;
 if(pending&&(pending.workspace!==workspace||pending.timerId!==timerId||pending.revision!==revision||pending.discarded!==true))return {status:'conflict'};
 if(state.activities.some(item=>item.timerId===timerId))return {status:'conflict'};
 if(state.timer) {
  if(state.timer.id!==timerId||(state.timer.revision??0)!==revision||state.timer.running||pending)return {status:'conflict'};
 } else if(!pending) return {status:'conflict'};
 const next:State={...state,timer:null,profile:{...state.profile,floatingPendingFinish:{workspace,timerId,revision,discarded:true}}};
 try {if(!await persist(next))return {status:'storage-error'};} catch {return {status:'storage-error'};}
 const after=current();
 if(!after)return {status:'locked'};
 if(after!==next||after.profile.floatingWorkspaceId!==workspace||after.timer||after.activities.some(item=>item.timerId===timerId))return {status:'conflict'};
 return {status:'committed'};
}
