package com.pablormlopez.miministerio;

import org.junit.Test;
import java.util.Collections;
import static org.junit.Assert.*;

public class TimerJournalTest {
    private static final class Store implements TimerJournal.Store {
        TimerJournal.State saved; boolean fail;
        public boolean commit(TimerJournal.State state) { if (fail) return false; saved=state; return true; }
    }
    private TimerJournal.State empty() { return new TimerJournal.State(null,null,Collections.emptyList()); }
    private TimerJournal.Timer running() { return new TimerJournal.Timer("timer",0,1000,500,true); }
    private TimerJournal.Command pause() { return new TimerJournal.Command("one","timer",0,4500,TimerJournal.Action.PAUSE); }

    @Test public void writesBeforePublishingAndSurvivesRestore() {
        Store store=new Store();TimerJournal journal=new TimerJournal(store,empty());
        assertEquals(TimerJournal.Result.APPLIED,journal.install("workspace",running()));
        store.fail=true;
        assertEquals(TimerJournal.Result.STORAGE_ERROR,journal.transition(pause()));
        assertEquals(0,journal.snapshot().timer.revision);assertTrue(journal.snapshot().pending.isEmpty());
        store.fail=false;
        assertEquals(TimerJournal.Result.APPLIED,journal.transition(pause()));
        TimerJournal restored=new TimerJournal(store,store.saved);
        assertEquals(4000,restored.snapshot().timer.elapsed);assertFalse(restored.snapshot().timer.running);
        assertEquals(TimerJournal.Result.DUPLICATE,restored.transition(pause()));
        assertEquals(1,restored.snapshot().pending.size());
    }
    @Test public void rejectsStaleSnapshotsAndAcknowledgesInOrder() {
        Store store=new Store();TimerJournal j=new TimerJournal(store,empty());
        j.install("workspace",running());j.transition(pause());
        TimerJournal.Command resume=new TimerJournal.Command("two","timer",1,7000,TimerJournal.Action.RESUME);
        assertEquals(TimerJournal.Result.APPLIED,j.transition(resume));
        assertEquals(TimerJournal.Result.CONFLICT,j.install("workspace",running()));
        assertEquals(TimerJournal.Result.CONFLICT,j.install("other",null));
        assertEquals(TimerJournal.Result.CONFLICT,j.acknowledge("workspace","two",2));
        assertEquals(TimerJournal.Result.CONFLICT,j.acknowledge("workspace","one",99));
        assertEquals(TimerJournal.Result.APPLIED,j.acknowledge("workspace","one",1));
        assertEquals(TimerJournal.Result.APPLIED,j.acknowledge("workspace","two",2));
        assertEquals(TimerJournal.Result.CONFLICT,j.transition(pause()));
        assertEquals(TimerJournal.Result.CONFLICT,j.install("workspace",running()));
        assertEquals(TimerJournal.Result.CONFLICT,j.install("workspace",null));
        assertEquals(TimerJournal.Result.CONFLICT,j.clear("workspace","timer",1));
        assertEquals(TimerJournal.Result.APPLIED,j.clear("workspace","timer",2));
        assertEquals(TimerJournal.Result.CONFLICT,j.transition(pause()));
    }
    @Test public void rejectsReusedIdClockRollbackAndBadTransitions() {
        Store store=new Store();TimerJournal j=new TimerJournal(store,empty());j.install("workspace",running());
        assertEquals(TimerJournal.Result.CONFLICT,j.transition(new TimerJournal.Command("x","timer",0,999,TimerJournal.Action.PAUSE)));
        assertEquals(TimerJournal.Result.CONFLICT,j.transition(new TimerJournal.Command("x","timer",0,1500,TimerJournal.Action.RESUME)));
        assertEquals(TimerJournal.Result.APPLIED,j.transition(pause()));
        assertEquals(TimerJournal.Result.CONFLICT,j.transition(new TimerJournal.Command("one","timer",0,4600,TimerJournal.Action.PAUSE)));
        assertEquals(TimerJournal.Result.CONFLICT,j.install("other",new TimerJournal.Timer("other",0,1,0,true)));
    }
}
