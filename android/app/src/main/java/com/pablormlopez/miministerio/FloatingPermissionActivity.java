package com.pablormlopez.miministerio;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

/** One-shot user-initiated trampoline; no permission request during normal launch. */
public final class FloatingPermissionActivity extends Activity {
    private boolean waitingOverlay, pausedForOverlay, notificationRequested, finished;
    private FloatingCoordinator coordinator;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        coordinator=FloatingCoordinator.get(this);
        if(state!=null) {
            waitingOverlay=state.getBoolean("waitingOverlay");pausedForOverlay=state.getBoolean("pausedForOverlay");
            notificationRequested=state.getBoolean("notificationRequested");
            return;
        }
        String token=getIntent().getStringExtra("activationToken");
        if(!coordinator.consumeActivation(token)){finish();return;}
        if(!Settings.canDrawOverlays(this)) {
            waitingOverlay=true;
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName()))); }
            catch(RuntimeException error){complete(false);}
        } else continueActivation();
    }
    @Override protected void onPause(){super.onPause();if(waitingOverlay)pausedForOverlay=true;}
    @Override protected void onResume(){super.onResume();
        if(waitingOverlay&&pausedForOverlay){waitingOverlay=false;if(Settings.canDrawOverlays(this))continueActivation();else complete(false);}
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        out.putBoolean("waitingOverlay",waitingOverlay);out.putBoolean("pausedForOverlay",pausedForOverlay);
        out.putBoolean("notificationRequested",notificationRequested);super.onSaveInstanceState(out);
    }
    private void continueActivation(){
        if(Build.VERSION.SDK_INT>=33 && !notificationRequested && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
            notificationRequested=true;requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},41);return;
        }
        complete(true);
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==41)complete(true); // FGS remains usable if notification permission is denied.
    }
    private void complete(boolean approved){
        if(finished)return;finished=true;
        if(approved){
            try {
                if(!getSharedPreferences("floating-display",MODE_PRIVATE).edit().putBoolean("enabled",true).commit())throw new IllegalStateException("Cannot save activation");
                Intent service=new Intent(this,FloatingService.class);
                if(Build.VERSION.SDK_INT>=26)startForegroundService(service);else startService(service);
            } catch(RuntimeException error){getSharedPreferences("floating-display",MODE_PRIVATE).edit().putBoolean("enabled",false).apply();approved=false;}
        }
        coordinator.activationResult(approved);finish();
    }
}
