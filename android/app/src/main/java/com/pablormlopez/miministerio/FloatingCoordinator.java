package com.pablormlopez.miministerio;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;
import java.util.UUID;

/** Process-local coordinator. The journal is the native command authority while
 * the feature is enabled. No profile, notes or vault keys are stored here. */
final class FloatingCoordinator {
    interface Sender { boolean send(String message); }
    interface Observer { void onTimerChanged(); }
    private static FloatingCoordinator instance;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final TimerJournal journal;
    private final Context context;
    private String activationToken;
    private long activationExpires;
    private Sender sender;
    private Observer observer;
    private boolean damaged;

    static synchronized FloatingCoordinator get(Context context) {
        if(instance==null)instance=new FloatingCoordinator(context.getApplicationContext());
        return instance;
    }
    private FloatingCoordinator(Context context) {
        this.context=context;
        TimerJournalStore store=new TimerJournalStore(context);
        TimerJournal.State state;
        try { state=store.load(); }
        catch(IOException error) {
            // Preserve the damaged file for recovery; do not overwrite or acknowledge it.
            damaged=true;
            state=new TimerJournal.State(null,null,java.util.Collections.emptyList());
            Log.e("FloatingTimer", "Cannot read timer journal",error);
        }
        journal=new TimerJournal(store,state);
    }
    void setObserver(Observer value) { observer=value; notifyObserver(); }
    void removeObserver(Observer value) { if(observer==value)observer=null; }
    void setSender(Sender value) { sender=value; if(value==null)activationToken=null; }
    boolean consumeActivation(String token) {
        boolean valid=token!=null && token.equals(activationToken) && android.os.SystemClock.elapsedRealtime()<activationExpires;
        activationToken=null;return valid;
    }
    void activationResult(boolean enabled) {
        if(sender==null)return;
        try {sender.send(new JSONObject().put("type",enabled?"overlay-enabled":"overlay-denied").toString());}
        catch(JSONException ignored) { }
    }
    TimerJournal.State snapshot() { return journal.snapshot(); }
    boolean available() { return !damaged && journal.snapshot().workspace!=null; }
    private void notifyObserver() { if(observer!=null)main.post(observer::onTimerChanged); }

    /** Persist first; then ask the web to reconcile. Failed writes never change the display. */
    TimerJournal.Result toggle() {
        if(!available())return TimerJournal.Result.CONFLICT;
        TimerJournal.Timer t=journal.snapshot().timer;
        long now=System.currentTimeMillis();
        TimerJournal.Command c=t==null
                ? new TimerJournal.Command(UUID.randomUUID().toString(),UUID.randomUUID().toString(),-1,now,TimerJournal.Action.START)
                : new TimerJournal.Command(UUID.randomUUID().toString(),t.id,t.revision,now,t.running?TimerJournal.Action.PAUSE:TimerJournal.Action.RESUME);
        TimerJournal.Result result=journal.transition(c);
        if(result==TimerJournal.Result.APPLIED){notifyObserver();sendPending();}
        return result;
    }
    void receive(String message) {
        if(damaged || message==null || message.length()>4096)return;
        try {
            JSONObject input=new JSONObject(message);
            String type=input.optString("type","");
            if("web-ready".equals(type)) {
                if(sender!=null)sender.send(new JSONObject().put("type","native-ready")
                    .put("package",context.getPackageName())
                    .put("enabled",context.getSharedPreferences("floating-display",Context.MODE_PRIVATE).getBoolean("enabled",false)).toString());
            } else if("arm-activation".equals(type)) {
                String token=input.optString("token","");
                if(!token.matches("[a-zA-Z0-9-]{16,128}"))return;
                activationToken=token;activationExpires=android.os.SystemClock.elapsedRealtime()+120000;
                if(sender!=null)sender.send(new JSONObject().put("type","activation-armed").put("token",token).toString());
            } else if("request-pending".equals(type)) {
                String requested=input.optString("workspace","");
                if(requested.isEmpty() || requested.length()>128)return;
                String existing=journal.snapshot().workspace;
                if(existing==null)sendStatus("pending-drained",requested);
                else if(existing.equals(requested)) {
                    if(journal.snapshot().pending.isEmpty())sendStatus("pending-drained");else sendPending();
                } else sendStatus("sync-conflict",requested);
            } else if("timer-ack".equals(type)) {
                String workspace=input.optString("workspace","");String id=input.optString("commandId","");
                if(!input.has("revision"))return;
                TimerJournal.Result result=journal.acknowledge(workspace,id,input.getLong("revision"));
                if(result==TimerJournal.Result.APPLIED){notifyObserver();if(journal.snapshot().pending.isEmpty())sendStatus("pending-drained");else sendPending();}
            } else if("timer-snapshot".equals(type)) {
                String workspace=input.optString("workspace","");
                if(workspace.isEmpty() || workspace.length()>128)return;
                if(!input.has("timer"))return;
                TimerJournal.Timer timer=null;
                if(!input.isNull("timer")) {
                    JSONObject t=input.getJSONObject("timer");
                    timer=new TimerJournal.Timer(t.getString("id"),t.getLong("revision"),t.getLong("start"),t.getLong("elapsed"),t.getBoolean("running"));
                }
                TimerJournal.Result result=journal.install(workspace,timer);
                if(result==TimerJournal.Result.APPLIED || result==TimerJournal.Result.DUPLICATE) {
                    notifyObserver();sendPending();sendStatus("sync-ready");
                } else sendStatus("sync-conflict");
            } else if("timer-clear".equals(type)) {
                TimerJournal.Result result=journal.clear(input.optString("workspace",""),input.optString("timerId",""),input.getLong("revision"));
                if(result==TimerJournal.Result.APPLIED){notifyObserver();sendStatus("sync-ready");}
                else sendStatus("sync-conflict");
            } else if("begin-finish".equals(type) || "end-finish".equals(type)) {
                String workspace=input.getString("workspace"),timerId=input.getString("timerId"),requestId=input.getString("requestId");
                if(requestId.isEmpty()||requestId.length()>128)return;
                long revision=input.getLong("revision");
                TimerJournal.Result result;
                if("begin-finish".equals(type))result=journal.beginFinish(workspace,timerId,revision);
                else {
                    if(!input.has("committed"))return;
                    result=journal.endFinish(workspace,timerId,revision,input.getBoolean("committed"));
                }
                if(result==TimerJournal.Result.APPLIED || result==TimerJournal.Result.DUPLICATE)notifyObserver();
                if(sender!=null)sender.send(new JSONObject().put("type","finish-result").put("requestId",requestId)
                        .put("workspace",workspace).put("timerId",timerId).put("revision",revision)
                        .put("result",result.name().toLowerCase(java.util.Locale.ROOT)).toString());
            } else if("web-command".equals(type)) {
                if(journal.snapshot().workspace==null || !journal.snapshot().workspace.equals(input.optString("workspace")))return;
                JSONObject raw=input.getJSONObject("command");
                String action=raw.getString("action");
                TimerJournal.Action selected;
                if("start".equals(action))selected=TimerJournal.Action.START;
                else if("pause".equals(action))selected=TimerJournal.Action.PAUSE;
                else if("resume".equals(action))selected=TimerJournal.Action.RESUME;
                else return;
                TimerJournal.Command command=new TimerJournal.Command(raw.getString("id"),raw.getString("timerId"),
                        raw.getLong("expectedRevision"),raw.getLong("at"),selected);
                TimerJournal.Result result=journal.transition(command);
                if(result==TimerJournal.Result.APPLIED || result==TimerJournal.Result.DUPLICATE){notifyObserver();sendPending();}
                else sendStatus("sync-conflict");
            }
        } catch(JSONException | RuntimeException error) { Log.w("FloatingTimer", "Invalid bridge message"); }
    }
    private void sendPending() {
        TimerJournal.State state=journal.snapshot();
        if(sender==null || state.pending.isEmpty())return;
        TimerJournal.Command c=state.pending.get(0);
        try {
            JSONObject command=new JSONObject().put("id",c.id).put("timerId",c.timerId)
                    .put("expectedRevision",c.expectedRevision).put("at",c.at)
                    .put("action",c.action==TimerJournal.Action.START?"start":c.action==TimerJournal.Action.PAUSE?"pause":"resume");
            sender.send(new JSONObject().put("type","timer-command").put("workspace",state.workspace).put("command",command).toString());
        } catch(JSONException ignored) { }
    }
    private void sendStatus(String type) { sendStatus(type,journal.snapshot().workspace); }
    private void sendStatus(String type,String workspace) {
        if(sender==null)return;
        try { sender.send(new JSONObject().put("type",type).put("workspace",workspace).toString()); }
        catch(JSONException ignored) { }
    }
}
