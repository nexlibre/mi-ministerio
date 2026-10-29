package com.pablormlopez.miministerio;

import android.app.Activity;
import android.content.ComponentName;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntent;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

import com.google.androidbrowserhelper.trusted.FocusActivity;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import com.google.androidbrowserhelper.trusted.TwaProviderPicker;
import com.google.androidbrowserhelper.trusted.splashscreens.SplashScreenStrategy;

/**
 * Experimental launcher for a TWA using one shared session for launch and
 * postMessage. Not selected by LauncherActivity until it is tested on Android.
 */
final class FloatingTwaLauncher extends TwaLauncher {
    private static final String TAG = "FloatingTwaLauncher";
    private static final Uri ORIGIN = Uri.parse("https://mi-ministerio-pablo.pablormlopez.chatgpt.site");
    private static final String HANDSHAKE = "mi-ministerio-floating-v1";
    interface Listener {
        void onChannelState(boolean ready);
        void onMessage(String message);
    }
    private final Activity activity;
    private final Listener listener;
    private CustomTabsSession session;
    private CustomTabsServiceConnection connection;
    private boolean bound;
    private boolean destroyed;
    private boolean validated;
    private boolean navigated;
    private boolean requested;
    private boolean ready;

    FloatingTwaLauncher(Activity activity, Listener listener) {
        super(activity);
        this.activity = activity;
        this.listener = listener;
    }

    @Override public void launch(TrustedWebActivityIntentBuilder builder, CustomTabsCallback original,
                                 @Nullable SplashScreenStrategy splash, @Nullable Runnable complete,
                                 FallbackStrategy fallback) {
        TwaProviderPicker.Action provider = TwaProviderPicker.pickProvider(activity.getPackageManager());
        if (provider.launchMode != TwaProviderPicker.LaunchMode.TRUSTED_WEB_ACTIVITY || provider.provider == null) {
            super.launch(builder, original, splash, complete, fallback);
            return;
        }
        if (splash != null) splash.onTwaLaunchInitiated(provider.provider, builder);
        CustomTabsCallback callback = new CustomTabsCallback() {
            @Override public void onNavigationEvent(int event, @Nullable Bundle extras) {
                original.onNavigationEvent(event, extras);
                if (event == NAVIGATION_STARTED) {
                    navigated = false; requested = false; setReady(false);
                } else if (event == NAVIGATION_FINISHED) {
                    navigated = true; requestChannel();
                }
            }
            @Override public void onRelationshipValidationResult(int relation, @NonNull Uri origin,
                                                                  boolean result, @Nullable Bundle extras) {
                original.onRelationshipValidationResult(relation, origin, result, extras);
                if (relation != CustomTabsService.RELATION_USE_AS_ORIGIN || !ORIGIN.equals(origin)) return;
                validated = result;
                if (result) requestChannel(); else setReady(false);
            }
            @Override public void onMessageChannelReady(@Nullable Bundle extras) {
                original.onMessageChannelReady(extras);
                if (destroyed || !validated || !navigated || session == null) return;
                setReady(true);
                if (session.postMessage(HANDSHAKE, null) != CustomTabsService.RESULT_SUCCESS) setReady(false);
            }
            @Override public void onPostMessage(@NonNull String message, @Nullable Bundle extras) {
                original.onPostMessage(message, extras);
                if (ready && message.length() <= 4096) listener.onMessage(message);
            }
            @Override public Bundle extraCallbackWithResult(@NonNull String name, @Nullable Bundle args) {
                return original.extraCallbackWithResult(name, args);
            }
        };
        connection = new CustomTabsServiceConnection() {
            @Override public void onCustomTabsServiceConnected(@NonNull ComponentName name, @NonNull CustomTabsClient client) {
                if (destroyed) return;
                client.warmup(0);
                session = client.newSession(callback, com.google.androidbrowserhelper.trusted.SessionStore.makeSessionId(activity.getTaskId()));
                if (session == null) { fallback.launch(activity, builder, provider.provider, complete); return; }
                session.validateRelationship(CustomTabsService.RELATION_USE_AS_ORIGIN, ORIGIN, null);
                Runnable open = () -> {
                    if (destroyed || session == null) return;
                    TrustedWebActivityIntent intent = builder.build(session);
                    FocusActivity.addToIntent(intent.getIntent(), activity);
                    intent.launchTrustedWebActivity(activity);
                    if (complete != null) complete.run();
                };
                if (splash != null) splash.configureTwaBuilder(builder, session, open); else open.run();
            }
            @Override public void onServiceDisconnected(ComponentName name) {
                session = null; validated = false; navigated = false; requested = false; setReady(false);
            }
        };
        bound = CustomTabsClient.bindCustomTabsServicePreservePriority(activity, provider.provider, connection);
        if (!bound) { connection = null; fallback.launch(activity, builder, provider.provider, complete); }
    }

    private void requestChannel() {
        if (destroyed || session == null || !validated || !navigated || requested) return;
        requested = session.requestPostMessageChannel(ORIGIN, ORIGIN, new Bundle());
        if (!requested) Log.w(TAG, "PostMessage channel unavailable");
    }
    private void setReady(boolean value) {
        if (ready == value) return;
        ready = value; listener.onChannelState(value);
    }
    boolean send(String message) {
        return ready && session != null && message.length() <= 4096
                && session.postMessage(message, null) == CustomTabsService.RESULT_SUCCESS;
    }
    @Override public void destroy() {
        if (destroyed) return;
        destroyed = true; setReady(false);
        if (bound && connection != null) activity.unbindService(connection);
        session = null; connection = null; bound = false;
        super.destroy();
    }
}
