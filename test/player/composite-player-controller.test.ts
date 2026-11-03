// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, Observable, of, Subject} from 'rxjs';

// player-controller-api keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; controllers need only types from it
vi.mock('../../src/media', () => ({}));

// audio worklet sync tick replaced with manually driven subject, AudioContext is not available in tests
const {syncTick$} = vi.hoisted(() => ({syncTick$: {current: undefined as any}}));
vi.mock('../../src/omakase-audio-context-provider', async () => {
  const {of, Subject} = await import('rxjs');
  syncTick$.current = new Subject<{}>();
  return {
    OmakaseAudioContextProvider: {
      instance: {
        get onSyncTick$() {
          return syncTick$.current.asObservable();
        },
        tryResumeAudioContext: () => of(void 0),
      },
    },
  };
});

import {CompositePlayerController} from '../../src/player/composite-player-controller';
import {ClockPlayerController} from '../../src/virtual/clock-player-controller';
import type {CompositePlaybackDomController} from '../../src/player/composite-playback-dom-controller';
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType, type PlayerDomController} from '../../src/player/player-controller-api';
import {MediaElementPlayback} from '../../src/common/media-element-playback';
import {FrameRateResolver} from '../../src/common/frame-rate';
import {MediaTemporalFormat} from '../../src/common/media-temporal';
import type {MainMediaState} from '../../src/media';

class FakeVideoElement {
  paused = true;
  seeking = false;
  playbackRate = 1;
  buffered: {length: number; start: (index: number) => number; end: (index: number) => number} = {length: 0, start: () => 0, end: () => 0};
  seeks: number[] = [];
  protected _currentTime = 0;

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(time: number) {
    this._currentTime = time;
    this.seeks.push(time);
  }
}

/** Media element controller, plays forward only */
class FakeForwardController {
  readonly onEvent$ = new Subject<PlayerControllerEvent>();
  readonly videoElement = new FakeVideoElement();
  readonly mediaElementPlayback = new MediaElementPlayback();
  playbackRate = 1;
  liveState: object | undefined;

  emit(type: PlayerControllerEventType, data: object = {}) {
    this.onEvent$.next({type, data} as PlayerControllerEvent);
  }

  getCurrentTime() {
    return this.videoElement.currentTime;
  }

  getDuration() {
    return 100;
  }

  convertTime(value: number) {
    return value;
  }

  resolveLiveState() {
    return this.liveState;
  }

  wireEvents = vi.fn();
  unwireEvents = vi.fn();
  destroy = vi.fn();

  play = vi.fn(() => {
    this.videoElement.paused = false;
    this.mediaElementPlayback.setPlaying();
    this.emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAY, {currentTime: this.getCurrentTime()});
    return of(void 0);
  });

  pause = vi.fn(() => {
    this.videoElement.paused = true;
    this.mediaElementPlayback.setPaused();
    this.emit(PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE, {currentTime: this.getCurrentTime()});
    return of(void 0);
  });

  seekTo = vi.fn((time: number) => {
    this.emit(PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING, {toTime: time});
    this.videoElement.currentTime = time;
    this.emit(PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED, {currentTime: time});
    return of(true);
  });

  setPlaybackRate = vi.fn((playbackRate: number) => {
    this.playbackRate = playbackRate;
    this.emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE, {playbackRate});
    return of(void 0);
  });

  setWaitingForSyncedMedia = vi.fn();
}

let now = 0;

const create = (seekStepPlaybackEnabled = true) => {
  let forward = new FakeForwardController();
  let reverse = new ClockPlayerController({} as unknown as PlayerDomController);
  let composite = new CompositePlayerController(forward as unknown as PlayerController, reverse, {seekStep: 2, minSeekInterval: 500});
  composite.setSeekStepPlaybackEnabled(seekStepPlaybackEnabled);
  composite.wireEvents({id: 'main', duration: 100, frameRateModel: FrameRateResolver.resolveFrameRateModel(25), initSegmentTimeOffset: 0} as unknown as MainMediaState);
  let events: PlayerControllerEvent[] = [];
  composite.onEvent$.subscribe((event) => events.push(event));
  let tick = () => syncTick$.current.next({});
  return {composite, forward, reverse, events, tick};
};

const eventTypes = (events: PlayerControllerEvent[]) => events.map((p) => p.type);

const playForwardAt = async (forward: FakeForwardController, composite: CompositePlayerController, time: number) => {
  forward.videoElement.currentTime = time;
  await firstValueFrom(composite.play());
};

describe('CompositePlayerController', () => {
  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays with forward controller and emits its events at playback rates media element can play at', async () => {
    let {composite, forward, events} = create();
    await playForwardAt(forward, composite, 10);
    await firstValueFrom(composite.setPlaybackRate(2));
    expect(composite.active).toBe(forward);
    expect(composite.seekStepPlayback).toBe(false);
    expect(forward.setPlaybackRate).toHaveBeenCalledWith(2);
    expect(composite.playbackRate).toBe(2);
    expect(eventTypes(events)).toEqual([PlayerControllerEventType.PLAYER_CONTROLLER_PLAY, PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE]);
  });

  it('switches to reverse controller backwards, continuing from forward time and playing state, without stray events', async () => {
    let {composite, forward, reverse, events} = create();
    await playForwardAt(forward, composite, 50);
    events.length = 0;

    await firstValueFrom(composite.setPlaybackRate(-1));
    expect(composite.active).toBe(reverse);
    expect(composite.seekStepPlayback).toBe(true);
    expect(composite.playbackRate).toBe(-1);
    expect(composite.getCurrentTime()).toBe(50);
    expect(composite.mediaElementPlayback!.state.playing).toBe(true);
    // forward media element is paused, its pause is not emitted
    expect(forward.videoElement.paused).toBe(true);
    expect(eventTypes(events)).toEqual([PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE, PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE]);
    expect(events[0]!.data).toEqual({playbackRate: -1});
    // first seek step leads main media time
    expect(forward.videoElement.seeks.at(-1)).toBe(48);
  });

  it('plays backwards on reverse clock, seeks forward media element in steps ahead of main media time, ignores forward events', async () => {
    let {composite, forward, events, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    events.length = 0;

    now = 1000;
    tick();
    expect(composite.getCurrentTime()).toBe(49);
    expect(eventTypes(events)).toContain(PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS);
    expect(forward.videoElement.seeks.at(-1)).toBe(48);

    now = 2000;
    tick();
    expect(composite.getCurrentTime()).toBe(48);
    expect(forward.videoElement.seeks.at(-1)).toBe(46);

    events.length = 0;
    forward.emit(PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE);
    expect(events).toEqual([]);
  });

  it('does not overlap seek steps and skips media already buffered', async () => {
    let {composite, forward, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    let seeks = forward.videoElement.seeks.length;

    forward.videoElement.seeking = true;
    now = 2000;
    tick();
    expect(forward.videoElement.seeks.length).toBe(seeks);

    forward.videoElement.seeking = false;
    forward.videoElement.buffered = {length: 1, start: () => 40, end: () => 50};
    now = 2100;
    tick();
    // lead main media time 45.9 is buffered
    expect(forward.videoElement.seeks.length).toBe(seeks);
  });

  it('pauses, seeks and plays on reverse clock, paused forward media element shows main media time', async () => {
    let {composite, forward, events, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-2));
    now = 1000;
    tick();

    await firstValueFrom(composite.pause());
    expect(eventTypes(events)).toContain(PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE);
    expect(forward.pause).toHaveBeenCalledTimes(1);
    expect(composite.getCurrentTime()).toBe(48);
    // forward controller seeks media element frame accurately, its seek events are not emitted
    expect(forward.seekTo).toHaveBeenLastCalledWith(48, MediaTemporalFormat.FRAME_COUNT);
    expect(forward.videoElement.seeks.at(-1)).toBe(48);

    await firstValueFrom(composite.seekTo(30));
    await Promise.resolve();
    expect(composite.getCurrentTime()).toBe(30);
    expect(forward.seekTo).toHaveBeenLastCalledWith(30, MediaTemporalFormat.FRAME_COUNT);
    expect(forward.videoElement.seeks.at(-1)).toBe(30);
    expect(events.filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING).map((p) => p.data)).toEqual([{fromTime: 48, toTime: 30}]);

    await firstValueFrom(composite.play());
    expect(composite.mediaElementPlayback!.state.playing).toBe(true);
    expect(forward.play).toHaveBeenCalledTimes(1);
  });

  it('seek steps wait for frame accurate seek of paused media element, which main media does not wait for', async () => {
    let {composite, forward, events, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-2));
    now = 1000;
    tick();

    // frame accurate seek is in progress
    let seeked$ = new Subject<boolean>();
    forward.seekTo.mockImplementationOnce((time: number) => {
      forward.videoElement.currentTime = time;
      return seeked$;
    });
    events.length = 0;
    await firstValueFrom(composite.pause());
    expect(forward.seekTo).toHaveBeenLastCalledWith(48, MediaTemporalFormat.FRAME_COUNT);
    // main media is paused right away, forward seek events are not emitted
    expect(composite.mediaElementPlayback!.state.paused).toBe(true);
    expect(eventTypes(events)).not.toContain(PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING);

    // seek steps wait for it, although seek step is due
    now = 3000;
    let seekCount = forward.videoElement.seeks.length;
    (composite as unknown as {seekStepForward: (time: number) => void}).seekStepForward(10);
    expect(forward.videoElement.seeks.length).toBe(seekCount);

    seeked$.next(true);
    seeked$.complete();
    (composite as unknown as {seekStepForward: (time: number) => void}).seekStepForward(10);
    expect(forward.videoElement.seeks.length).toBe(seekCount + 1);
  });

  it('seeks paused media element to frame at main media time, frame start can be later than snapped main media time', async () => {
    let {composite, forward, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-2));
    now = 1000;
    tick();

    let convertTime = vi.spyOn(forward, 'convertTime').mockImplementation(((value: number) => Math.floor(value * 25)) as typeof forward.convertTime);
    await firstValueFrom(composite.pause());
    expect(convertTime).toHaveBeenCalledWith(48, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
    expect(forward.seekTo).toHaveBeenLastCalledWith(1200, MediaTemporalFormat.FRAME_COUNT);

    // playing media element is seeked to main media time
    convertTime.mockRestore();
    await firstValueFrom(composite.play());
    await firstValueFrom(composite.setPlaybackRate(1));
    expect(forward.seekTo).toHaveBeenLastCalledWith(48);
  });

  it('continues seek steps once frame accurate seek finishes after main media plays again', async () => {
    let {composite, forward, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-2));
    now = 1000;
    tick();

    let seeked$ = new Subject<boolean>();
    forward.seekTo.mockImplementationOnce(() => seeked$);
    await firstValueFrom(composite.pause());
    await firstValueFrom(composite.play());

    seeked$.next(true);
    now = 2000;
    tick();
    expect(forward.videoElement.seeks.at(-1)).toBeLessThan(48);
  });

  it('changes reverse playback rate on reverse clock', async () => {
    let {composite, forward, reverse, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    now = 1000;
    tick();

    await firstValueFrom(composite.setPlaybackRate(32));
    expect(composite.active).toBe(reverse);
    expect(composite.playbackRate).toBe(32);
    expect(forward.setPlaybackRate).not.toHaveBeenCalled();
    now = 2000;
    tick();
    expect(composite.getCurrentTime()).toBe(81);
  });

  it('switches back to forward controller at reverse time and playing state, forward seek events are emitted', async () => {
    let {composite, forward, events, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    now = 3000;
    tick();
    events.length = 0;

    await firstValueFrom(composite.setPlaybackRate(1));
    expect(composite.active).toBe(forward);
    expect(composite.seekStepPlayback).toBe(false);
    expect(forward.setPlaybackRate).toHaveBeenCalledWith(1);
    expect(forward.seekTo).toHaveBeenCalledWith(47);
    expect(forward.play).toHaveBeenCalledTimes(2);
    expect(composite.getCurrentTime()).toBe(47);
    let types = eventTypes(events);
    // forward controller's own playback rate update is dropped, composite emits one
    expect(types.filter((p) => p === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE).length).toBe(1);
    expect(types).toEqual(
      expect.arrayContaining([PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING, PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED, PlayerControllerEventType.PLAYER_CONTROLLER_PLAY])
    );

    // reverse clock events are not emitted anymore
    events.length = 0;
    now = 4000;
    tick();
    expect(events).toEqual([]);
  });

  it('stays paused once switched back to forward controller while paused', async () => {
    let {composite, forward} = create();
    forward.videoElement.currentTime = 50;
    await firstValueFrom(composite.setPlaybackRate(-1));
    expect(composite.mediaElementPlayback!.state.playing).toBe(false);
    await firstValueFrom(composite.seekTo(40));
    await Promise.resolve();

    await firstValueFrom(composite.setPlaybackRate(1));
    expect(forward.seekTo).toHaveBeenCalledWith(40, MediaTemporalFormat.FRAME_COUNT);
    expect(forward.play).not.toHaveBeenCalled();
  });

  it('pauses at main media start when playing backwards', async () => {
    let {composite, forward, events, tick} = create();
    await playForwardAt(forward, composite, 1);
    await firstValueFrom(composite.setPlaybackRate(-1));
    events.length = 0;
    now = 2000;
    tick();
    expect(composite.getCurrentTime()).toBe(0);
    expect(eventTypes(events)).toContain(PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE);
    expect(forward.videoElement.seeks.at(-1)).toBe(0);
  });

  it('routes waiting for synced media to active controller', async () => {
    let {composite, forward, reverse, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    composite.setWaitingForSyncedMedia(true);
    expect(forward.setWaitingForSyncedMedia).not.toHaveBeenCalledWith(true);
    expect(reverse.mediaElementPlayback!.state.waitingSyncedMedia).toBe(true);
    now = 1000;
    tick();
    // reverse clock stopped while waiting, keeps playing state
    expect(composite.getCurrentTime()).toBe(50);
    expect(composite.mediaElementPlayback!.state.playing).toBe(true);

    composite.setWaitingForSyncedMedia(false);
    now = 2000;
    expect(composite.getCurrentTime()).toBe(49);
  });

  it('moves waiting for synced media to reverse controller, playing on once waiting is cleared', async () => {
    let {composite, forward, reverse, tick} = create();
    await playForwardAt(forward, composite, 50);
    composite.setWaitingForSyncedMedia(true);
    expect(forward.setWaitingForSyncedMedia).toHaveBeenLastCalledWith(true);
    // forward controller pauses media element while waiting
    forward.videoElement.paused = true;

    await firstValueFrom(composite.setPlaybackRate(-1));
    expect(forward.setWaitingForSyncedMedia).toHaveBeenLastCalledWith(false);
    expect(reverse.mediaElementPlayback!.state.waitingSyncedMedia).toBe(true);
    expect(composite.mediaElementPlayback!.state.playing).toBe(true);
    now = 1000;
    tick();
    expect(composite.getCurrentTime()).toBe(50);

    composite.setWaitingForSyncedMedia(false);
    now = 2000;
    tick();
    expect(composite.getCurrentTime()).toBe(49);
  });

  it('moves waiting for synced media to forward controller once it plays', async () => {
    let {composite, forward, reverse} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    composite.setWaitingForSyncedMedia(true);

    await firstValueFrom(composite.setPlaybackRate(1));
    expect(reverse.mediaElementPlayback!.state.waitingSyncedMedia).toBe(false);
    expect(forward.setWaitingForSyncedMedia).toHaveBeenLastCalledWith(true);
    // waiting is applied after play, play would drop playback state forward controller resumes once waiting is cleared
    expect(forward.setWaitingForSyncedMedia.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(forward.play.mock.invocationCallOrder.at(-1)!);

    // reverse clock doesn't resume when switched to again
    composite.setWaitingForSyncedMedia(false);
    expect(reverse.mediaElementPlayback!.state.playing).toBe(false);
  });

  it('leaves live main media and invalid playback rates to forward controller', async () => {
    let {composite, forward} = create();
    await firstValueFrom(composite.setPlaybackRate(Number.NaN));
    expect(forward.setPlaybackRate).toHaveBeenLastCalledWith(1);

    forward.liveState = {};
    await firstValueFrom(composite.setPlaybackRate(-1));
    expect(composite.active).toBe(forward);
    expect(forward.setPlaybackRate).toHaveBeenLastCalledWith(-1);
  });

  it('rejects playback rates media element cannot play at while trick track is not loaded', async () => {
    let {composite, forward, events} = create(false);
    await playForwardAt(forward, composite, 50);
    events.length = 0;

    await expect(firstValueFrom(composite.setPlaybackRate(-1))).rejects.toThrow('Playback rate -1 not supported');
    await expect(firstValueFrom(composite.setPlaybackRate(32))).rejects.toThrow('Playback rate 32 not supported');
    expect(composite.active).toBe(forward);
    expect(composite.seekStepPlayback).toBe(false);
    expect(composite.playbackRate).toBe(1);
    expect(forward.setPlaybackRate).not.toHaveBeenCalled();
    expect(events).toEqual([]);

    // playback rates media element can play at are not affected
    await firstValueFrom(composite.setPlaybackRate(16));
    expect(forward.setPlaybackRate).toHaveBeenLastCalledWith(16);
  });

  it('plays backwards once trick track is loaded', async () => {
    let {composite, forward, reverse} = create(false);
    await playForwardAt(forward, composite, 50);

    composite.setSeekStepPlaybackEnabled(true);
    await firstValueFrom(composite.setPlaybackRate(-1));
    expect(composite.active).toBe(reverse);
    expect(composite.playbackRate).toBe(-1);
  });

  it('switches back to forward controller at default playback rate once trick track is unloaded', async () => {
    let {composite, forward, events, tick} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(-1));
    now = 3000;
    tick();
    events.length = 0;

    composite.setSeekStepPlaybackEnabled(false);
    expect(composite.active).toBe(forward);
    expect(composite.seekStepPlayback).toBe(false);
    expect(forward.setPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(forward.seekTo).toHaveBeenCalledWith(47);
    expect(events.find((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE)!.data).toEqual({playbackRate: 1});

    await expect(firstValueFrom(composite.setPlaybackRate(-1))).rejects.toThrow();
  });

  it('keeps forward playback rate once trick track is unloaded', async () => {
    let {composite, forward, events} = create();
    await playForwardAt(forward, composite, 50);
    await firstValueFrom(composite.setPlaybackRate(2));
    events.length = 0;

    composite.setSeekStepPlaybackEnabled(false);
    expect(composite.playbackRate).toBe(2);
    expect(events).toEqual([]);
  });

  it('converts time formats with forward controller', async () => {
    let {composite, forward} = create();
    let convertTime = vi.spyOn(forward, 'convertTime');
    forward.videoElement.currentTime = 50;
    await firstValueFrom(composite.setPlaybackRate(-1));
    composite.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
    expect(convertTime).toHaveBeenCalledWith(50, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
  });

  it('wires media slot element once, refreshes it on wiring and destroys it together with composite', () => {
    let {composite} = create();
    let playbackDomController = {
      setVideoTimeOffset: vi.fn(),
      attachController: vi.fn(),
      refreshMediaState: vi.fn(),
      destroy: vi.fn(),
    };
    composite.attachPlaybackDomController(playbackDomController as unknown as CompositePlaybackDomController);
    expect(playbackDomController.attachController).toHaveBeenCalledWith(composite);

    composite.wireEvents({id: 'main', duration: 100, frameRateModel: FrameRateResolver.resolveFrameRateModel(25), initSegmentTimeOffset: 3} as unknown as MainMediaState);
    expect(playbackDomController.refreshMediaState).toHaveBeenCalled();
    expect(playbackDomController.setVideoTimeOffset.mock.calls[0]![0]()).toBe(3);

    composite.destroy();
    expect(playbackDomController.destroy).toHaveBeenCalled();
  });
});
