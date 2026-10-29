package com.pablormlopez.miministerio;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Model for commands produced while the TWA cannot respond. A Store must commit
 * each complete state atomically and durably before returning true. This class
 * is not connected to the overlay yet; no vault data or keys belong here.
 */
final class TimerJournal {
    private static final long JS_SAFE_INTEGER = 9007199254740991L;
    private static final int MAX_PENDING = 128;
    interface Store { boolean commit(State state); }
    enum Action { START, PAUSE, RESUME }
    enum Result { APPLIED, DUPLICATE, CONFLICT, STORAGE_ERROR }

    static final class Timer {
        final String id;
        final long revision, start, elapsed;
        final boolean running;
        Timer(String id, long revision, long start, long elapsed, boolean running) {
            this.id = id; this.revision = revision; this.start = start;
            this.elapsed = elapsed; this.running = running;
        }
        boolean valid() {
            return id != null && !id.isEmpty() && revision >= 0 && revision < JS_SAFE_INTEGER
                    && start >= 0 && start <= JS_SAFE_INTEGER && elapsed >= 0 && elapsed <= JS_SAFE_INTEGER;
        }
        boolean same(Timer other) {
            return other != null && id.equals(other.id) && revision == other.revision
                    && start == other.start && elapsed == other.elapsed && running == other.running;
        }
    }
    static final class Command {
        final String id, timerId;
        final long expectedRevision, at;
        final Action action;
        Command(String id, String timerId, long expectedRevision, long at, Action action) {
            this.id=id; this.timerId=timerId; this.expectedRevision=expectedRevision;
            this.at=at; this.action=action;
        }
        boolean same(Command c) {
            return c != null && Objects.equals(id,c.id) && Objects.equals(timerId,c.timerId)
                    && expectedRevision==c.expectedRevision && at==c.at && action==c.action;
        }
    }
    static final class State {
        final String workspace;
        final Timer timer;
        final List<Command> pending;
        State(String workspace, Timer timer, List<Command> pending) {
            this.workspace=workspace; this.timer=timer;
            this.pending=Collections.unmodifiableList(new ArrayList<>(pending));
        }
    }

    private final Store store;
    private State state;
    TimerJournal(Store store, State restored) {
        this.store=Objects.requireNonNull(store);
        this.state=Objects.requireNonNull(restored);
    }
    synchronized State snapshot() { return state; }

    /** Never accept a web snapshot over unacknowledged native commands. */
    synchronized Result install(String workspace, Timer incoming) {
        if (workspace == null || workspace.isEmpty() || (incoming != null && !incoming.valid())) return Result.CONFLICT;
        if (!state.pending.isEmpty()) return Result.CONFLICT;
        if (state.workspace != null && !state.workspace.equals(workspace)) return Result.CONFLICT;
        if (state.timer != null && (incoming == null || !state.timer.id.equals(incoming.id))) return Result.CONFLICT;
        if (state.timer != null && incoming != null) {
            if (incoming.revision < state.timer.revision) return Result.CONFLICT;
            if (incoming.revision == state.timer.revision)
                return state.timer.same(incoming) ? Result.DUPLICATE : Result.CONFLICT;
        }
        State next = new State(workspace, incoming, state.pending);
        return save(next);
    }

    /** Clear a finished/discarded timer only against an exact known revision. */
    synchronized Result clear(String workspace, String timerId, long revision) {
        if (!Objects.equals(state.workspace,workspace) || !state.pending.isEmpty() || state.timer == null
                || !state.timer.id.equals(timerId) || state.timer.revision != revision) return Result.CONFLICT;
        return save(new State(workspace,null,state.pending));
    }

    synchronized Result transition(Command command) {
        if (command == null || command.id == null || command.id.isEmpty() || command.action == null
                || command.timerId == null || command.timerId.isEmpty() || command.at < 0
                || command.at > JS_SAFE_INTEGER
                || (command.action == Action.START ? command.expectedRevision != -1 : command.expectedRevision < 0)) return Result.CONFLICT;
        for (Command pending : state.pending)
            if (pending.id.equals(command.id)) return pending.same(command) ? Result.DUPLICATE : Result.CONFLICT;
        if (state.pending.size() >= MAX_PENDING) return Result.CONFLICT;
        Timer timer=state.timer;
        if (command.action == Action.START) {
            if (state.workspace == null || timer != null || !state.pending.isEmpty()) return Result.CONFLICT;
            Timer started=new Timer(command.timerId,0,command.at,0,true);
            if (!started.valid()) return Result.CONFLICT;
            List<Command> pending=new ArrayList<>();pending.add(command);
            return save(new State(state.workspace,started,pending));
        }
        if (state.workspace == null || timer == null || !timer.valid() || !timer.id.equals(command.timerId)
                || timer.revision != command.expectedRevision || command.at < timer.start
                || (command.action == Action.PAUSE) != timer.running) return Result.CONFLICT;
        long elapsed=timer.elapsed;
        if (command.action == Action.PAUSE) {
            long delta=command.at-timer.start;
            if (delta > JS_SAFE_INTEGER-elapsed) return Result.CONFLICT;
            elapsed += delta;
        }
        Timer nextTimer=new Timer(timer.id,timer.revision+1,command.at,elapsed,command.action==Action.RESUME);
        if (!nextTimer.valid()) return Result.CONFLICT;
        List<Command> pending=new ArrayList<>(state.pending);pending.add(command);
        return save(new State(state.workspace,nextTimer,pending));
    }

    /** Ack only the head after the web has durably committed that exact revision. */
    synchronized Result acknowledge(String workspace, String commandId, long committedRevision) {
        if (!Objects.equals(state.workspace,workspace) || state.pending.isEmpty()) return Result.CONFLICT;
        Command first=state.pending.get(0);
        if (!first.id.equals(commandId) || committedRevision != first.expectedRevision+1) return Result.CONFLICT;
        List<Command> pending=new ArrayList<>(state.pending);pending.remove(0);
        return save(new State(state.workspace,state.timer,pending));
    }
    private Result save(State next) {
        try { if (!store.commit(next)) return Result.STORAGE_ERROR; }
        catch (RuntimeException error) { return Result.STORAGE_ERROR; }
        state=next;return Result.APPLIED;
    }
}
