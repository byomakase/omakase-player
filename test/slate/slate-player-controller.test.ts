// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, Observable, Subject} from 'rxjs';

// player-controller-api keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; slate controller needs only types from it
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

import {SlatePlayerController, type SlatePlayerControllerConfig} from '../../src/slate/slate-player-controller';
import {type PlayerControllerEvent, PlayerControllerEventType, type PlayerDomController} from '../../src/player/player-controller-api';
import {MediaTemporalFormat} from '../../src/common/media-temporal';
import type {MainMediaState, MainMediaUpdateableAttrs} from '../../src/media';

const DURATION = 10;

let wallMs = 0;

const tick = () => syncTick$.current.next({});

const advance = (seconds: number) => {
  wallMs += seconds * 1000;
  tick();
};

const domController = {
  setVideoPoster: () => {},
} as unknown as PlayerDomController;

const createLoaded = async (loadOptions: Record<string, any> = {duration: DURATION, frameRate: 25}, config?: Partial<SlatePlayerControllerConfig>) => {
  let controller = new SlatePlayerController(domController, config);
  let attrs: MainMediaUpdateableAttrs = {};
  await firstValueFrom(
    controller.loadMainMedia({
      url: 'virtual://slate',
      loadOptions: loadOptions as any,
      mainMediaEssentialArgsHook: (args) =>
        new Observable<void>((o) => {
          attrs = args;
          o.next();
          o.complete();
        }),
      tracksCreatedHook: () =>
        new Observable<void>((o) => {
          o.next();
          o.complete();
        }),
    })
  );
  controller.wireEvents({initSegmentTimeOffset: 0, loadOptions, ...attrs} as MainMediaState);
  let events: PlayerControllerEvent[] = [];
  controller.onEvent$.subscribe((p) => events.push(p));
  return {controller, attrs, events};
};

const eventTypes = (events: PlayerControllerEvent[]) => events.map((p) => p.type).filter((p) => p !== PlayerControllerEventType.PLAYER_CONTROLLER_MEDIA_ELEMENT_PLAYBACK_CHANGE);

describe('SlatePlayerController', () => {
  beforeEach(() => {
    wallMs = 0;
    syncTick$.current = new Subject<{}>();
    vi.spyOn(performance, 'now').mockImplementation(() => wallMs);
  });

  it('loads virtual media with provided duration and frame rate', async () => {
    let {controller, attrs} = await createLoaded();
    expect(attrs.duration).toBe(DURATION);
    expect(attrs.frameRateModel?.value).toBe(25);
    expect(attrs.hasVideo).toBe(false);
    expect(attrs.hasAudio).toBe(false);
    expect(controller.getDuration()).toBe(DURATION);
    expect(controller.getCurrentTime()).toBe(0);
  });

  it('fails to load without duration', async () => {
    let controller = new SlatePlayerController(domController);
    await expect(
      firstValueFrom(
        controller.loadMainMedia({
          url: 'virtual://slate',
          loadOptions: {},
          mainMediaEssentialArgsHook: () => new Observable<void>(),
          tracksCreatedHook: () => new Observable<void>(),
        })
      )
    ).rejects.toThrow();
  });

  it('advances time while playing and snaps to frame on pause', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.play());
    advance(1.23);
    expect(controller.getCurrentTime()).toBeCloseTo(1.23, 5);
    await firstValueFrom(controller.pause());
    expect(controller.getCurrentTime(MediaTemporalFormat.FRAME_COUNT)).toBe(30);
    expect(controller.getCurrentTime()).toBeCloseTo(1.2, 5);
    advance(1);
    expect(controller.getCurrentTime()).toBeCloseTo(1.2, 5);
    expect(eventTypes(events)).toEqual([
      PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
      PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS,
      PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS,
      PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
    ]);
  });

  it('seeks in seconds, frames and timecode', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.seekTo(2));
    expect(controller.getCurrentTime()).toBe(2);
    await firstValueFrom(controller.seekTo(100, MediaTemporalFormat.FRAME_COUNT));
    expect(controller.getCurrentTime()).toBe(4);
    await firstValueFrom(controller.seekTo('00:00:06:00', MediaTemporalFormat.TIMECODE));
    expect(controller.getCurrentTime()).toBe(6);
    await firstValueFrom(controller.seekFromCurrentTime(-25, MediaTemporalFormat.FRAME_COUNT));
    expect(controller.getCurrentTime()).toBe(5);
    await firstValueFrom(controller.seekTo(999));
    expect(controller.getCurrentTime()).toBe(DURATION);
    let seekEvents = eventTypes(events);
    expect(seekEvents.filter((p) => p === PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING).length).toBe(5);
    expect(seekEvents.filter((p) => p === PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED).length).toBe(5);
  });

  it.each([30, '24000/1001', '30000/1001'])('steps frame by frame from current frame at %s fps', async (frameRate) => {
    let {controller} = await createLoaded({duration: DURATION, frameRate});
    for (let frame = 1; frame <= 120; frame++) {
      await firstValueFrom(controller.seekFromCurrentTime(1, MediaTemporalFormat.FRAME_COUNT));
      expect(controller.getCurrentTime(MediaTemporalFormat.FRAME_COUNT)).toBe(frame);
    }
    for (let frame = 119; frame >= 0; frame--) {
      await firstValueFrom(controller.seekFromCurrentTime(-1, MediaTemporalFormat.FRAME_COUNT));
      expect(controller.getCurrentTime(MediaTemporalFormat.FRAME_COUNT)).toBe(frame);
    }
  });

  it('keeps playing after seek while playing', async () => {
    let {controller} = await createLoaded();
    await firstValueFrom(controller.play());
    advance(1);
    await firstValueFrom(controller.seekTo(5));
    advance(1);
    expect(controller.mediaElementPlayback!.playing).toBe(true);
    expect(controller.getCurrentTime()).toBeCloseTo(6, 5);
  });

  it('emits playback progress once per media frame', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.play());
    // 25fps, frame is 40ms, ticks every 5ms for 100ms => frames 0, 1, 2
    for (let i = 0; i < 20; i++) {
      advance(0.005);
    }
    let progress = events.filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS);
    expect(progress.length).toBe(3);
    expect(progress.map((p) => (p.data as {currentTime: number}).currentTime)).toEqual([expect.closeTo(0.005, 5), expect.closeTo(0.04, 5), expect.closeTo(0.08, 5)]);
  });

  it('emits playback progress on every tick when throttling is disabled', async () => {
    let {controller, events} = await createLoaded(void 0, {throttlePlaybackProgress: false});
    await firstValueFrom(controller.play());
    for (let i = 0; i < 20; i++) {
      advance(0.005);
    }
    expect(events.filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS).length).toBe(20);
  });

  it('emits playback progress after seek into last emitted frame', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.play());
    advance(0.01);
    await firstValueFrom(controller.seekTo(0));
    advance(0.01);
    expect(events.filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS).length).toBe(2);
  });

  it('emits playback progress when stepping frames while paused', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.seekFromCurrentTime(1, MediaTemporalFormat.FRAME_COUNT));
    await firstValueFrom(controller.seekFromCurrentTime(1, MediaTemporalFormat.FRAME_COUNT));
    let progressEvents = events.filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS);
    expect(progressEvents.map((p) => p.data.currentTime)).toEqual([1 / 25, 2 / 25]);
  });

  it('emits playback progress per media frame at increased playback rate', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.setPlaybackRate(2));
    await firstValueFrom(controller.play());
    // 196ms wall at 2x => 392ms media => frames 0..9
    for (let i = 0; i < 49; i++) {
      advance(0.004);
    }
    expect(events.filter((p) => p.type === PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS).length).toBe(10);
  });

  it('emits ended at duration and restarts on play', async () => {
    let {controller, events} = await createLoaded();
    await firstValueFrom(controller.play());
    advance(DURATION + 1);
    expect(controller.getCurrentTime()).toBe(DURATION);
    expect(eventTypes(events)).toContain(PlayerControllerEventType.PLAYER_CONTROLLER_ENDED);
    expect(controller.mediaElementPlayback!.ended).toBe(true);
    await firstValueFrom(controller.play());
    expect(controller.getCurrentTime()).toBe(0);
  });

  it('respects playback rate', async () => {
    let {controller} = await createLoaded();
    await firstValueFrom(controller.setPlaybackRate(2));
    await firstValueFrom(controller.play());
    advance(1);
    expect(controller.getCurrentTime()).toBeCloseTo(2, 5);
  });

  it('freezes clock while waiting for synced media', async () => {
    let {controller} = await createLoaded();
    await firstValueFrom(controller.play());
    advance(1);
    controller.setWaitingForSyncedMedia(true);
    advance(3);
    expect(controller.getCurrentTime()).toBeCloseTo(1, 5);
    controller.setWaitingForSyncedMedia(false);
    advance(1);
    expect(controller.getCurrentTime()).toBeCloseTo(2, 5);
  });
});
