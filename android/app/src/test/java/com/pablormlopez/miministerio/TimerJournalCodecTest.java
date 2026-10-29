package com.pablormlopez.miministerio;

import org.junit.Test;
import java.util.Collections;
import static org.junit.Assert.*;

public class TimerJournalCodecTest {
    @Test public void roundTripAndRejectDamage() throws Exception {
        TimerJournal.Store store=s->true;
        TimerJournal j=new TimerJournal(store,new TimerJournal.State(null,null,Collections.emptyList()));
        j.install("workspace",new TimerJournal.Timer("timer",0,1000,500,true));
        j.transition(new TimerJournal.Command("one","timer",0,4500,TimerJournal.Action.PAUSE));
        byte[] encoded=TimerJournalCodec.encode(j.snapshot());
        TimerJournal.State decoded=TimerJournalCodec.decode(encoded);
        assertEquals("workspace",decoded.workspace);assertEquals(4000,decoded.timer.elapsed);
        assertEquals("one",decoded.pending.get(0).id);
        byte[] damaged=encoded.clone();damaged[0]=0;
        assertThrows(java.io.IOException.class,()->TimerJournalCodec.decode(damaged));
        assertThrows(java.io.IOException.class,()->TimerJournalCodec.decode(java.util.Arrays.copyOf(encoded,encoded.length-1)));
        byte[] extra=java.util.Arrays.copyOf(encoded,encoded.length+1);
        assertThrows(java.io.IOException.class,()->TimerJournalCodec.decode(extra));
    }
    @Test public void rejectsMismatchedOrDuplicateJournalCommands() {
        TimerJournal.Timer timer=new TimerJournal.Timer("timer",2,7000,4000,true);
        TimerJournal.Command a=new TimerJournal.Command("id","timer",0,4500,TimerJournal.Action.PAUSE);
        TimerJournal.Command b=new TimerJournal.Command("id","timer",1,7000,TimerJournal.Action.RESUME);
        assertThrows(java.io.IOException.class,()->TimerJournalCodec.encode(new TimerJournal.State("workspace",timer,java.util.Arrays.asList(a,b))));
        assertThrows(java.io.IOException.class,()->TimerJournalCodec.encode(new TimerJournal.State("workspace",null,Collections.singletonList(a))));
    }
}
