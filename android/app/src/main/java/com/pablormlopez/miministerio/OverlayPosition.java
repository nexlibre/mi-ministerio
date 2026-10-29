package com.pablormlopez.miministerio;

/** Pure geometry used by the overlay; coordinates are pixels in display space. */
final class OverlayPosition {
    private OverlayPosition() {}

    static int clamp(int coordinate, int min, int end, int size) {
        int max = Math.max(min, end - Math.max(0, size));
        return Math.max(min, Math.min(max, coordinate));
    }
    static float fraction(int coordinate, int min, int end, int size) {
        int span = Math.max(0, end - min - Math.max(0, size));
        if (span == 0) return 0f;
        return (float)(clamp(coordinate, min, end, size) - min) / span;
    }
    static int fromFraction(float fraction, int min, int end, int size) {
        float safe = Float.isNaN(fraction) ? 0f : Math.max(0f, Math.min(1f, fraction));
        int span = Math.max(0, end - min - Math.max(0, size));
        return min + Math.round(span * safe);
    }
}
