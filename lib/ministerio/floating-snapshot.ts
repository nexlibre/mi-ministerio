import type {State} from './model';

/** Do not let Android install a state which only exists in memory. Call after
 * the current write queue settles and discard the result if the channel or
 * workspace changes. Identity is intentional: a later edit must itself be
 * durably encrypted, even when the timer happens to be unchanged. */
export function floatingSnapshot(state:State|null,durable:State|null,workspace:string) {
 if(!state||state!==durable||state.profile.floatingWorkspaceId!==workspace)return null;
 const t=state.timer;
 if(t&&!t.id)return null;
 return {type:'timer-snapshot' as const,workspace,timer:t?{id:t.id,revision:t.revision??0,start:t.start,elapsed:t.elapsed,running:t.running}:null};
}
