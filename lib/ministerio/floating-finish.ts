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
 try {if(!await persist(next))return {status:'storage-error'};} catch {return {status:'storage-error'};}
 const after=current();
 if(!after)return {status:'locked'};
 if(after!==next||after.profile.floatingWorkspaceId!==workspace||after.timer||
    after.activities.filter(item=>item.timerId===timerId).length!==1||
    !after.activities.some(item=>item.timerId===timerId&&item.id===activityId))return {status:'conflict'};
 return {status:'committed',activityId};
}
