import {describe, expect, it} from 'vitest';
import {SidecarTimeWindow, SidecarTimeWindowPosition} from '../../src/video/sidecar-time-window';

describe('SidecarTimeWindow', () => {
  // sidecar is played from 3 to 10, starting when main media is on 20
  const timeWindow = SidecarTimeWindow.resolve({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, 60);

  it('resolves window duration and playerEndTime', () => {
    expect(timeWindow.windowDuration).toBe(7);
    expect(timeWindow.playerEndTime).toBe(27);
  });

  it('maps main media time to sidecar time', () => {
    expect(timeWindow.toSidecarTime(20)).toBe(3);
    expect(timeWindow.toSidecarTime(21)).toBe(4);
    expect(timeWindow.toSidecarTime(26.5)).toBe(9.5);
  });

  it('clamps sidecar time to cutStartTime and cutEndTime', () => {
    expect(timeWindow.toSidecarTime(0)).toBe(3);
    expect(timeWindow.toSidecarTime(19.99)).toBe(3);
    expect(timeWindow.toSidecarTime(27)).toBe(10);
    expect(timeWindow.toSidecarTime(100)).toBe(10);
  });

  it('maps sidecar time to main media time', () => {
    expect(timeWindow.toMainTime(3)).toBe(20);
    expect(timeWindow.toMainTime(4)).toBe(21);
  });

  it('resolves position', () => {
    expect(timeWindow.resolvePosition(19.99)).toBe(SidecarTimeWindowPosition.BEFORE);
    expect(timeWindow.resolvePosition(20)).toBe(SidecarTimeWindowPosition.IN_WINDOW);
    expect(timeWindow.resolvePosition(26.99)).toBe(SidecarTimeWindowPosition.IN_WINDOW);
    expect(timeWindow.resolvePosition(27)).toBe(SidecarTimeWindowPosition.AFTER);
    expect(timeWindow.isInWindow(21)).toBe(true);
    expect(timeWindow.isInWindow(27)).toBe(false);
  });

  it('resolves warm-up position before playerStartTime', () => {
    expect(timeWindow.warmUpIn(2)).toBe(18);
    expect(timeWindow.resolvePosition(17.99, 2)).toBe(SidecarTimeWindowPosition.BEFORE);
    expect(timeWindow.resolvePosition(18, 2)).toBe(SidecarTimeWindowPosition.WARM_UP);
    expect(timeWindow.resolvePosition(19.99, 2)).toBe(SidecarTimeWindowPosition.WARM_UP);
    expect(timeWindow.resolvePosition(20, 2)).toBe(SidecarTimeWindowPosition.IN_WINDOW);
    expect(timeWindow.resolvePosition(27, 2)).toBe(SidecarTimeWindowPosition.AFTER);
  });

  it('limits warm-up to sidecar media before cutStartTime', () => {
    expect(timeWindow.warmUpIn(5)).toBe(17);
    expect(timeWindow.resolvePosition(16.99, 5)).toBe(SidecarTimeWindowPosition.BEFORE);
    const fromStart = SidecarTimeWindow.resolve({cutStartTime: 0, cutEndTime: 10, playerStartTime: 20}, 60);
    expect(fromStart.warmUpIn(2)).toBe(20);
    expect(fromStart.resolvePosition(19.99, 2)).toBe(SidecarTimeWindowPosition.BEFORE);
  });

  it('maps main media time to sidecar time in warm-up', () => {
    expect(timeWindow.toSidecarTime(0, 2)).toBe(1);
    expect(timeWindow.toSidecarTime(18, 2)).toBe(1);
    expect(timeWindow.toSidecarTime(19, 2)).toBe(2);
    expect(timeWindow.toSidecarTime(20, 2)).toBe(3);
    expect(timeWindow.toSidecarTime(100, 2)).toBe(10);
    expect(timeWindow.toSidecarTime(0, 5)).toBe(0);
  });

  it('resolves undefined cutEndTime to duration', () => {
    const resolved = SidecarTimeWindow.resolve({cutStartTime: 3, cutEndTime: undefined, playerStartTime: 20}, 12);
    expect(resolved.cutEndTime).toBe(12);
    expect(resolved.playerEndTime).toBe(29);
  });

  it('resolves undefined playerStartTime to main media start', () => {
    const resolved = SidecarTimeWindow.resolve({cutStartTime: 3, cutEndTime: 10}, 60);
    expect(resolved.playerStartTime).toBe(0);
    expect(resolved.toSidecarTime(1)).toBe(4);
  });

  it('resolves undefined cutEndTime to infinity when duration is unknown', () => {
    const resolved = SidecarTimeWindow.resolve({cutStartTime: 0, cutEndTime: undefined, playerStartTime: 0}, Number.NaN);
    expect(resolved.cutEndTime).toBe(Number.POSITIVE_INFINITY);
    expect(resolved.isInWindow(1000)).toBe(true);
  });

  it('clamps cutEndTime to duration', () => {
    const resolved = SidecarTimeWindow.resolve({cutStartTime: 3, cutEndTime: 100, playerStartTime: 20}, 12);
    expect(resolved.cutEndTime).toBe(12);
  });

  it('fails when cutStartTime is out of duration', () => {
    expect(() => SidecarTimeWindow.resolve({cutStartTime: 15, cutEndTime: undefined, playerStartTime: 20}, 12)).toThrow();
  });

  describe('reverse', () => {
    it('resolves warm-up after time window end, limited by sidecar media after cutEndTime', () => {
      expect(timeWindow.resolveWarmUp(2, true)).toBe(2);
      expect(timeWindow.warmUpIn(2, true)).toBe(29);
      // 50 seconds of sidecar media after cutEndTime
      expect(timeWindow.resolveWarmUp(100, true)).toBe(50);
    });

    it('resolves position in reverse playback direction', () => {
      expect(timeWindow.resolvePosition(30, 2, true)).toBe(SidecarTimeWindowPosition.BEFORE);
      expect(timeWindow.resolvePosition(29, 2, true)).toBe(SidecarTimeWindowPosition.BEFORE);
      expect(timeWindow.resolvePosition(28, 2, true)).toBe(SidecarTimeWindowPosition.WARM_UP);
      expect(timeWindow.resolvePosition(27, 2, true)).toBe(SidecarTimeWindowPosition.WARM_UP);
      expect(timeWindow.resolvePosition(26.9, 2, true)).toBe(SidecarTimeWindowPosition.IN_WINDOW);
      expect(timeWindow.resolvePosition(20, 2, true)).toBe(SidecarTimeWindowPosition.IN_WINDOW);
      expect(timeWindow.resolvePosition(19.9, 2, true)).toBe(SidecarTimeWindowPosition.AFTER);
      // warm-up before playerStartTime is forward only
      expect(timeWindow.resolvePosition(19, 2, true)).toBe(SidecarTimeWindowPosition.AFTER);
    });

    it('maps reverse warm-up to sidecar media after cutEndTime', () => {
      expect(timeWindow.toSidecarTime(28, 2, true)).toBe(11);
      expect(timeWindow.toSidecarTime(100, 2, true)).toBe(12);
      expect(timeWindow.toSidecarTime(26, 2, true)).toBe(9);
      // no warm-up before cutStartTime
      expect(timeWindow.toSidecarTime(0, 2, true)).toBe(3);
    });

    it('has no warm-up when cut ends at sidecar end or sidecar duration is unknown', () => {
      const toEnd = SidecarTimeWindow.resolve({cutStartTime: 3, cutEndTime: undefined, playerStartTime: 20}, 12);
      expect(toEnd.resolveWarmUp(2, true)).toBe(0);
      expect(toEnd.resolvePosition(29.5, 2, true)).toBe(SidecarTimeWindowPosition.BEFORE);
      expect(toEnd.toSidecarTime(40, 2, true)).toBe(12);

      const unknownDuration = SidecarTimeWindow.resolve({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, Number.NaN);
      expect(unknownDuration.resolveWarmUp(2, true)).toBe(0);
      expect(unknownDuration.warmUpIn(2, true)).toBe(27);
    });
  });
});
