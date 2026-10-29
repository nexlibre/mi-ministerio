import type {State} from './model';
import {elapsed} from './model';

/** Revisioned timer transitions. These functions do not perform I/O or acknowledge
 * a remote command; callers must durably persist the returned state first. */
export type Timer = NonNullable<State['timer']>;
export type TimerCommand = {
 id:string;
 timerId:string;
 expectedRevision:number;
 action:'pause'|'resume';
 at:number;
};
type AppliedCommand = {id:string;revision:number;action:'start'|'pause'|'resume';at:number};
export type ReconcileResult =
 | {status:'applied';timer:Timer}
 | {status:'duplicate';timer:Timer}
 | {status:'conflict';timer:Timer;reason:string};

export function identifyTimer(timer:Timer,makeId:()=>string = () => crypto.randomUUID()):Timer {
 return {...timer,id:timer.id||makeId(),revision:timer.revision??0};
}

export function applyTimerCommand(timer:Timer,command:TimerCommand):ReconcileResult {
 const revision=timer.revision??0;
 if(!timer.id || timer.id!==command.timerId)return {status:'conflict',timer,reason:'timer'};
 if(!command.id || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision<0 ||
    !Number.isSafeInteger(command.at) || command.at<0 || !['pause','resume'].includes(command.action))
  return {status:'conflict',timer,reason:'invalid'};
 const prior=timer.recentCommands?.find((c:AppliedCommand)=>c.id===command.id);
 if(prior) return prior.revision===command.expectedRevision && prior.action===command.action && prior.at===command.at
  ? {status:'duplicate',timer} : {status:'conflict',timer,reason:'command-id'};
 if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER||revision!==command.expectedRevision)
  return {status:'conflict',timer,reason:'revision'};
 if((command.action==='pause')!==timer.running)return {status:'conflict',timer,reason:'state'};
 // Avoid silently losing time when a delayed command or clock adjustment precedes
 // the beginning of the current segment. Surface it for reconciliation instead.
 if(command.at<timer.start)return {status:'conflict',timer,reason:'clock'};
 const next:Timer={...timer,start:command.at,elapsed:command.action==='pause'?elapsed(timer,command.at):timer.elapsed,
  running:command.action==='resume',revision:revision+1,
  recentCommands:[...(timer.recentCommands||[]),{id:command.id,revision,action:command.action,at:command.at}].slice(-128)};
 return {status:'applied',timer:next};
}
