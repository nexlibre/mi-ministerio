package com.pablormlopez.miministerio;

import android.content.Context;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Collections;

/** Private, no-backup journal. Failure never discards or acknowledges commands. */
final class TimerJournalStore implements TimerJournal.Store {
    private final AtomicFile file;
    TimerJournalStore(Context context) {
        file=new AtomicFile(new File(context.getNoBackupFilesDir(),"floating-timer-journal"));
    }
    TimerJournal.State load() throws IOException {
        try (FileInputStream in=file.openRead(); ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096];int count,total=0;
            while((count=in.read(buffer))!=-1) {
                total+=count;if(total>65536)throw new IOException("Journal too large");
                bytes.write(buffer,0,count);
            }
            return TimerJournalCodec.decode(bytes.toByteArray());
        } catch(FileNotFoundException missing) { return new TimerJournal.State(null,null,Collections.emptyList()); }
    }
    @Override public boolean commit(TimerJournal.State state) {
        FileOutputStream out=null;
        try {
            byte[] bytes=TimerJournalCodec.encode(state);
            out=file.startWrite();out.write(bytes);out.flush();out.getFD().sync();file.finishWrite(out);
            return true;
        } catch(IOException | RuntimeException error) {
            if(out!=null)file.failWrite(out);
            return false;
        }
    }
}
