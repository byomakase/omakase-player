// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {SeekStepper, SeekStepPlaybackUtil} from '../../src/common/seek-step-playback';

describe('SeekStepPlaybackUtil', () => {
  it('resolves playback rates media element cannot play at', () => {
    expect(SeekStepPlaybackUtil.isSeekStepPlaybackRate(-1)).toBe(true);
    expect(SeekStepPlaybackUtil.isSeekStepPlaybackRate(-0.5)).toBe(true);
    expect(SeekStepPlaybackUtil.isSeekStepPlaybackRate(1)).toBe(false);
    expect(SeekStepPlaybackUtil.isSeekStepPlaybackRate(16)).toBe(false);
    expect(SeekStepPlaybackUtil.isSeekStepPlaybackRate(32)).toBe(true);
  });

  it('resolves media element playback rate', () => {
    expect(SeekStepPlaybackUtil.resolveMediaElementPlaybackRate(2)).toBe(2);
    expect(SeekStepPlaybackUtil.resolveMediaElementPlaybackRate(16)).toBe(16);
    expect(SeekStepPlaybackUtil.resolveMediaElementPlaybackRate(-2)).toBe(1);
    expect(SeekStepPlaybackUtil.resolveMediaElementPlaybackRate(32)).toBe(1);
  });
});

describe('SeekStepper', () => {
  const stepper = () => new SeekStepper({seekStep: 2, minSeekInterval: 500});

  it('seeks right away, then once playhead moved seek step times playback rate, leading playhead by seek step', () => {
    let seekStepper = stepper();
    expect(seekStepper.resolveSeekTime(50, {playbackRate: -1, now: 0})).toBe(48);
    expect(seekStepper.resolveSeekTime(49, {playbackRate: -1, now: 1000})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(48, {playbackRate: -1, now: 2000})).toBe(46);
  });

  it('scales seek step with playback rate, seeks are issued at steady pace', () => {
    let seekStepper = stepper();
    expect(seekStepper.resolveSeekTime(50, {playbackRate: -4, now: 0})).toBe(42);
    // 4 seconds of main media in 1 second
    expect(seekStepper.resolveSeekTime(46, {playbackRate: -4, now: 1000})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(42, {playbackRate: -4, now: 2000})).toBe(34);

    let fast = stepper();
    expect(fast.resolveSeekTime(10, {playbackRate: 32, now: 0})).toBe(74);
    expect(fast.resolveSeekTime(42, {playbackRate: 32, now: 1000})).toBeUndefined();
    expect(fast.resolveSeekTime(74, {playbackRate: 32, now: 2000})).toBe(138);
  });

  it('applies min seek interval to seek step shorter than it', () => {
    let seekStepper = new SeekStepper({seekStep: 0.1, minSeekInterval: 500});
    expect(seekStepper.resolveSeekTime(50, {playbackRate: -1, now: 0})).toBeCloseTo(49.9);
    expect(seekStepper.resolveSeekTime(49.8, {playbackRate: -1, now: 200})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(49.5, {playbackRate: -1, now: 500})).toBeCloseTo(49.4);
  });

  it('maps lead playhead time, ie. clamps it to media bounds, and does not seek to same time again', () => {
    let seekStepper = stepper();
    let mapTime = (time: number) => Math.max(time, 0);
    expect(seekStepper.resolveSeekTime(1, {playbackRate: -1, mapTime, now: 0})).toBe(0);
    expect(seekStepper.resolveSeekTime(-1, {playbackRate: -1, mapTime, now: 2000})).toBeUndefined();
  });

  it('skips seek to media already buffered, seeks once lead playhead reaches media not buffered', () => {
    let seekStepper = stepper();
    let isBuffered = (time: number) => time >= 45;
    expect(seekStepper.resolveSeekTime(50, {playbackRate: -1, isBuffered, now: 0})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(47.5, {playbackRate: -1, isBuffered, now: 2500})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(46.9, {playbackRate: -1, isBuffered, now: 3100})).toBeCloseTo(44.9);
  });

  it('does not overlap seeks, seeks to latest lead time once media element is done seeking', () => {
    let seekStepper = stepper();
    expect(seekStepper.resolveSeekTime(50, {playbackRate: -1, now: 0})).toBe(48);
    // seek step reached, previous seek still in progress
    expect(seekStepper.resolveSeekTime(47, {playbackRate: -1, seeking: true, now: 3000})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(46, {playbackRate: -1, seeking: false, now: 4000})).toBe(44);
  });

  it('replaces seek not finished in seek timeout', () => {
    let seekStepper = stepper();
    expect(seekStepper.resolveSeekTime(50, {playbackRate: -1, now: 0})).toBe(48);
    expect(seekStepper.resolveSeekTime(47, {playbackRate: -1, seeking: true, now: 9999})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(47, {playbackRate: -1, seeking: true, now: 10000})).toBe(45);
  });

  it('is due one seek step from exact seek, and right away after reset', () => {
    let seekStepper = stepper();
    seekStepper.markSeek(50, 50, 0);
    expect(seekStepper.resolveSeekTime(49, {playbackRate: -1, now: 1000})).toBeUndefined();
    expect(seekStepper.resolveSeekTime(48, {playbackRate: -1, now: 2000})).toBe(46);
    seekStepper.reset();
    expect(seekStepper.resolveSeekTime(47.5, {playbackRate: -1, seeking: true, now: 2010})).toBe(45.5);
  });

  it('uses defaults', () => {
    expect(new SeekStepper({seekStep: undefined}).config).toEqual({seekStep: 2, minSeekInterval: 500});
  });
});
