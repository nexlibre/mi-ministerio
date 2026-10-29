package com.pablormlopez.miministerio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

/**
 * Native overlay renderer. This service is deliberately not exposed from the UI
 * until the authenticated TWA bridge and durable reconciliation are complete.
 * It never changes timer state or writes an activity record by itself.
 */
public final class FloatingService extends Service {
    private static final String CHANNEL = "floating_timer";
    private static final int NOTIFICATION = 1101;
    public static final String ACTION_HIDE = "com.pablormlopez.miministerio.HIDE_FLOATING";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windows;
    private WindowManager.LayoutParams params;
    private DragFrame root;
    private TextView time, toggle, close;
    private SharedPreferences preferences;
    private long elapsedMs;
    private long observedAt;
    private boolean running;
    private boolean connected;
    private FloatingCoordinator coordinator;
    private final FloatingCoordinator.Observer observer = new FloatingCoordinator.Observer() {
        @Override public void onTimerChanged() { refreshTimer(); }
        @Override public void onAppearanceChanged() { rebuildWindow(); }
    };
    private final Runnable repaint = new Runnable() {
        @Override public void run() {
            renderTime();
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        preferences = getSharedPreferences("floating-display", MODE_PRIVATE);
        coordinator = FloatingCoordinator.get(this);
        coordinator.setObserver(observer);
        windows = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
        startForeground(NOTIFICATION, notification());
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_HIDE.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (root == null) showWindow();
        return START_NOT_STICKY;
    }

    private void rebuildWindow() {
        if(root==null)return;
        rememberPosition();
        handler.removeCallbacks(repaint);
        try { windows.removeView(root); } catch(IllegalArgumentException ignored) { }
        root=null;time=null;toggle=null;close=null;
        if(Settings.canDrawOverlays(this))showWindow();else stopSelf();
    }

    private void showWindow() {
        // Only presentation preferences are held here, never names, notes or vault keys.
        float scale = Math.max(.75f, Math.min(1.35f, preferences.getFloat("scale", 1f)));
        int style = Math.max(0, Math.min(3, preferences.getInt("style", 0)));
        int alpha = Math.max(80, Math.min(255, preferences.getInt("alpha", 230)));
        int background = style == 1 ? Color.rgb(25, 34, 39)
                : style == 2 ? Color.rgb(250, 250, 247)
                : style == 3 ? Color.rgb(23, 61, 81) : Color.rgb(36, 71, 87);
        int foreground = style == 2 ? Color.rgb(23, 61, 81) : Color.WHITE;
        root = new DragFrame();
        GradientDrawable shape = new GradientDrawable();
        shape.setColor((background & 0x00ffffff) | (alpha << 24));
        shape.setCornerRadius(dp(12 * scale));
        if (style == 0) shape.setStroke(dp(1), 0x99ffffff);
        root.setBackground(shape);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setOrientation(LinearLayout.HORIZONTAL);
        int padding = dp(4 * scale);
        row.setPadding(padding, padding, padding, padding);
        time = new TextView(this);
        time.setGravity(Gravity.CENTER);
        time.setTextColor(foreground);
        time.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        time.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14 * scale);
        time.setContentDescription("Tiempo del cronómetro");
        row.addView(time, new LinearLayout.LayoutParams(dp(70 * scale), dp(40 * scale)));
        toggle = control("▶", "Iniciar o pausar el cronómetro", foreground, scale);
        toggle.setOnClickListener(v -> {
            TimerJournal.Result result=coordinator.toggle();
            if(result!=TimerJournal.Result.APPLIED && result!=TimerJournal.Result.DUPLICATE)
                android.widget.Toast.makeText(this,"No se pudo cambiar el cronómetro. Abre Mi Ministerio para sincronizar.",android.widget.Toast.LENGTH_SHORT).show();
        });
        row.addView(toggle, new LinearLayout.LayoutParams(dp(40 * scale), dp(40 * scale)));
        close = control("×", "Ocultar cronómetro flotante", foreground, scale);
        close.setOnClickListener(v -> stopSelf());
        row.addView(close, new LinearLayout.LayoutParams(dp(36 * scale), dp(40 * scale)));
        root.addView(row);
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        params = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        try {
            windows.addView(root, params);
            coordinator.overlayShown();
            root.post(this::restorePosition);
            refreshTimer();
            handler.post(repaint);
        } catch (RuntimeException e) {
            root = null;
            stopSelf();
        }
    }

    private TextView control(String symbol, String description, int color, float scale) {
        TextView result = new TextView(this);
        result.setText(symbol);
        result.setTextColor(color);
        result.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20 * scale);
        result.setGravity(Gravity.CENTER);
        result.setContentDescription(description);
        result.setClickable(true);
        return result;
    }

    private void refreshTimer() {
        if (time == null || coordinator == null) return;
        TimerJournal.State state=coordinator.snapshot();
        connected=coordinator.available();
        TimerJournal.Timer timer=state.timer;
        running=timer!=null && timer.running;
        long now=System.currentTimeMillis();
        elapsedMs=timer==null?0:timer.elapsed+(timer.running?Math.max(0,now-timer.start):0);
        observedAt=android.os.SystemClock.elapsedRealtime();
        toggle.setEnabled(connected && !state.finishing);
        toggle.setAlpha(connected && !state.finishing?1f:.45f);
        toggle.setText(running?"Ⅱ":"▶");
        toggle.setContentDescription(running?"Pausar cronómetro":"Iniciar o reanudar cronómetro");
        int color=preferences.getInt(running?"activeColor":"pausedColor",running?0xffe8c56a:0xffc6d3d8);
        time.setTextColor(color);
        renderTime();
    }

    private void renderTime() {
        if (time == null) return;
        if (!connected) { time.setText("--:--:--"); return; }
        long elapsed = Math.max(0, elapsedMs + (running ? Math.max(0, android.os.SystemClock.elapsedRealtime() - observedAt) : 0));
        long seconds = elapsed / 1000;
        time.setText(String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, (seconds / 60) % 60, seconds % 60));
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private Rect usableBounds() {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowMetrics metrics = windows.getCurrentWindowMetrics();
            Rect b = new Rect(metrics.getBounds());
            android.graphics.Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            b.left += insets.left; b.top += insets.top; b.right -= insets.right; b.bottom -= insets.bottom;
            return b;
        }
        android.util.DisplayMetrics m = new android.util.DisplayMetrics();
        windows.getDefaultDisplay().getRealMetrics(m);
        int statusId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        int navId = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        int top = statusId == 0 ? 0 : getResources().getDimensionPixelSize(statusId);
        int bottom = navId == 0 ? 0 : getResources().getDimensionPixelSize(navId);
        return new Rect(0, top, m.widthPixels, Math.max(top, m.heightPixels - bottom));
    }

    private void restorePosition() {
        if (root == null || params == null || !root.isAttachedToWindow()) return;
        Rect b = usableBounds();
        updatePosition(OverlayPosition.fromFraction(preferences.getFloat("x", .85f), b.left, b.right, root.getWidth()),
                OverlayPosition.fromFraction(preferences.getFloat("y", .25f), b.top, b.bottom, root.getHeight()));
    }

    private void updatePosition(int x, int y) {
        if (root == null || params == null || !root.isAttachedToWindow()) return;
        Rect b = usableBounds();
        params.x = OverlayPosition.clamp(x, b.left, b.right, root.getWidth());
        params.y = OverlayPosition.clamp(y, b.top, b.bottom, root.getHeight());
        try { windows.updateViewLayout(root, params); } catch (IllegalArgumentException ignored) { }
    }

    private void rememberPosition() {
        if (root == null || params == null) return;
        Rect b = usableBounds();
        preferences.edit().putFloat("x", OverlayPosition.fraction(params.x, b.left, b.right, root.getWidth()))
                .putFloat("y", OverlayPosition.fraction(params.y, b.top, b.bottom, root.getHeight())).apply();
    }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (root != null) root.post(this::restorePosition);
    }

    private final class DragFrame extends FrameLayout {
        float downX, downY;
        int startX, startY;
        boolean dragging;
        final int slop = ViewConfiguration.get(FloatingService.this).getScaledTouchSlop();
        DragFrame() { super(FloatingService.this); }
        @Override public boolean onInterceptTouchEvent(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX(); downY = event.getRawY();
                    startX = params.x; startY = params.y; dragging = false; return false;
                case MotionEvent.ACTION_MOVE:
                    if (Math.abs(event.getRawX() - downX) > slop || Math.abs(event.getRawY() - downY) > slop) {
                        dragging = true; return true;
                    }
                    break;
            }
            return false;
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: return true;
                case MotionEvent.ACTION_MOVE:
                    if (!dragging && (Math.abs(event.getRawX()-downX)>slop || Math.abs(event.getRawY()-downY)>slop)) dragging=true;
                    if (dragging) updatePosition(startX + Math.round(event.getRawX() - downX), startY + Math.round(event.getRawY() - downY));
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (dragging) rememberPosition();
                    dragging=false; return true;
            }
            return true;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Cronómetro flotante", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Mantiene visible el cronómetro flotante.");
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }
    private Notification notification() {
        Intent hide = new Intent(this, FloatingService.class).setAction(ACTION_HIDE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent hideIntent = PendingIntent.getService(this, 0, hide, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.ic_menu_recent_history).setContentTitle("Cronómetro flotante")
                .setContentText("Pulsa para ocultar la ventana.").setContentIntent(hideIntent).setOngoing(true).build();
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (coordinator != null) { coordinator.removeObserver(observer); coordinator.overlayHidden(); }
        if (root != null) { try { windows.removeView(root); } catch (IllegalArgumentException ignored) { } root=null; }
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
