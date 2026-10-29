package com.pablormlopez.miministerio;

import org.junit.Test;
import static org.junit.Assert.*;

public class OverlayPositionTest {
    @Test public void clampsToUsefulEdges() {
        assertEquals(12, OverlayPosition.clamp(-200, 12, 1000, 150));
        assertEquals(850, OverlayPosition.clamp(2000, 12, 1000, 150));
        assertEquals(500, OverlayPosition.clamp(500, 12, 1000, 150));
    }
    @Test public void oversizedWindowsNeverGoBeforeInset() {
        assertEquals(40, OverlayPosition.clamp(500, 40, 120, 150));
        assertEquals(40, OverlayPosition.fromFraction(1, 40, 120, 150));
        assertEquals(0f, OverlayPosition.fraction(50, 40, 120, 150), 0f);
    }
    @Test public void relativePositionSurvivesOrientationAndResize() {
        float right = OverlayPosition.fraction(850, 12, 1000, 150);
        assertEquals(1f, right, .0001f);
        assertEquals(1650, OverlayPosition.fromFraction(right, 20, 1800, 150));
        assertEquals(1720, OverlayPosition.fromFraction(right, 20, 1800, 80));
        assertEquals(20, OverlayPosition.fromFraction(Float.NaN, 20, 1800, 80));
        assertEquals(20, OverlayPosition.fromFraction(-4f, 20, 1800, 80));
    }
}
