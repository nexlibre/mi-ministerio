package com.pablormlopez.miministerio;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Strict binary codec. Contains only an opaque workspace id, timer and commands. */
final class TimerJournalCodec {
    private static final int MAGIC=0x4d4d544a, VERSION=2, MAX_BYTES=65536, MAX_PENDING=128;
    private static void id(String value) throws IOException {
        if (value == null || value.isEmpty() || value.length()>128) throw new IOException("Invalid journal identifier");
    }
    static byte[] encode(TimerJournal.State state) throws IOException {
        validate(state);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        DataOutputStream out=new DataOutputStream(bytes);
        out.writeInt(MAGIC);out.writeInt(VERSION);
        out.writeBoolean(state.workspace!=null);if(state.workspace!=null)out.writeUTF(state.workspace);
        out.writeBoolean(state.timer!=null);
        if(state.timer!=null) {
            out.writeUTF(state.timer.id);out.writeLong(state.timer.revision);out.writeLong(state.timer.start);
            out.writeLong(state.timer.elapsed);out.writeBoolean(state.timer.running);
        }
        out.writeBoolean(state.finishing);
        out.writeBoolean(state.lastFinishedId!=null);if(state.lastFinishedId!=null)out.writeUTF(state.lastFinishedId);
        out.writeInt(state.pending.size());
        for(TimerJournal.Command c:state.pending) {
            out.writeUTF(c.id);out.writeUTF(c.timerId);out.writeLong(c.expectedRevision);
            out.writeLong(c.at);out.writeByte(c.action==TimerJournal.Action.PAUSE?0:c.action==TimerJournal.Action.RESUME?1:2);
        }
        out.flush();byte[] result=bytes.toByteArray();
        if(result.length>MAX_BYTES)throw new IOException("Journal too large");
        return result;
    }
    static TimerJournal.State decode(byte[] bytes) throws IOException {
        if(bytes.length>MAX_BYTES)throw new IOException("Journal too large");
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes));
        if(in.readInt()!=MAGIC)throw new IOException("Invalid journal magic");
        int version=in.readInt();if(version<1 || version>VERSION)throw new IOException("Invalid journal version");
        String workspace=in.readBoolean()?in.readUTF():null;
        TimerJournal.Timer timer=null;
        if(in.readBoolean())timer=new TimerJournal.Timer(in.readUTF(),in.readLong(),in.readLong(),in.readLong(),in.readBoolean());
        boolean finishing=version>=2 && in.readBoolean();
        String lastFinishedId=version>=2 && in.readBoolean()?in.readUTF():null;
        int count=in.readInt();if(count<0 || count>MAX_PENDING)throw new IOException("Invalid journal length");
        List<TimerJournal.Command> pending=new ArrayList<>();
        for(int i=0;i<count;i++) {
            String commandId=in.readUTF(),timerId=in.readUTF();long revision=in.readLong(),at=in.readLong();int action=in.readUnsignedByte();
            if(action>2)throw new IOException("Invalid journal action");
            pending.add(new TimerJournal.Command(commandId,timerId,revision,at,action==0?TimerJournal.Action.PAUSE:action==1?TimerJournal.Action.RESUME:TimerJournal.Action.START));
        }
        if(in.read()!=-1)throw new IOException("Trailing journal data");
        TimerJournal.State state=new TimerJournal.State(workspace,timer,pending,finishing,lastFinishedId);validate(state);return state;
    }
    private static void validate(TimerJournal.State state) throws IOException {
        if(state==null || state.pending.size()>MAX_PENDING)throw new IOException("Invalid journal");
        if(state.workspace!=null)id(state.workspace);
        if(state.lastFinishedId!=null)id(state.lastFinishedId);
        if(state.finishing && (state.timer==null || state.timer.running || !state.pending.isEmpty()))throw new IOException("Invalid finish lock");
        if(state.timer!=null) { if(state.workspace==null || !state.timer.valid() || state.timer.id.equals(state.lastFinishedId))throw new IOException("Invalid timer");id(state.timer.id); }
        if(!state.pending.isEmpty() && state.timer==null)throw new IOException("Commands without timer");
        Set<String> ids=new HashSet<>();long revision=-2,at=-1;TimerJournal.Action previous=null;
        for(TimerJournal.Command c:state.pending) {
            id(c.id);id(c.timerId);
            if(!ids.add(c.id) || c.action==null || !c.timerId.equals(state.timer.id) || (c.action==TimerJournal.Action.START ? c.expectedRevision!=-1 || previous!=null : c.expectedRevision<0) || c.at<0
                    || (revision!=-2 && c.expectedRevision!=revision+1) || (at>=0 && c.at<at)
                    || (previous!=null && ((previous==TimerJournal.Action.START || previous==TimerJournal.Action.RESUME) != (c.action==TimerJournal.Action.PAUSE))))
                throw new IOException("Invalid command sequence");
            revision=c.expectedRevision;at=c.at;previous=c.action;
        }
        if(!state.pending.isEmpty() && (revision+1!=state.timer.revision || at!=state.timer.start
                || state.timer.running!=(previous==TimerJournal.Action.RESUME || previous==TimerJournal.Action.START)))throw new IOException("Journal state mismatch");
    }
}
