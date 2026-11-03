// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, NEVER, of, Subject} from 'rxjs';

// player-controller-api keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; controller needs only types from it
vi.mock('../../src/media', () => ({}));

import {TrickTrackControllerImpl} from '../../src/frame-image/trick-track-controller';
import type {FrameImageSidecarDomController} from '../../src/frame-image/frame-image-sidecar-dom-controller';
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType} from '../../src/player/player-controller-api';
import type {MediaContainerTrackState} from '../../src/media';
import {SourceType} from '../../src/source/source';

const onEvent$ = new Subject<PlayerControllerEvent>();
let mainTime = 30;
let playing = true;

const playerController = {
  get onEvent$() {
    return onEvent$.asObservable();
  },
  get mediaElementPlayback() {
    return {state: {playing}, seeking: false};
  },
  getCurrentTime: () => mainTime,
  playbackRate: 1,
} as unknown as PlayerController;

/** Sets main media playback rate, as main media does - virtual main media plays at every playback rate natively */
const setPlaybackRate = (playbackRate: number) => {
  (playerController as {playbackRate: number}).playbackRate = playbackRate;
  onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE, data: {playbackRate}} as PlayerControllerEvent);
};

/** Pauses or plays main media, as main media does */
const setPlaying = (value: boolean) => {
  playing = value;
  onEvent$.next({type: value ? PlayerControllerEventType.PLAYER_CONTROLLER_PLAY : PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE, data: {currentTime: mainTime}} as PlayerControllerEvent);
};

const createLoaded = async () => {
  let visible = true;
  let ready = true;
  let domController = {
    get visible() {
      return visible;
    },
    set visible(value: boolean) {
      visible = value;
    },
    duration: 60,
    clock: undefined as unknown,
    loadSource: vi.fn(() => of(void 0)),
    loadDuration: vi.fn(() => of(60)),
    release: vi.fn(),
    setClock: vi.fn((clock: unknown) => (domController.clock = clock)),
    isReady: () => ready,
    setReady: (value: boolean) => (ready = value),
    buffering: false,
    onStatus$: NEVER,
    destroy: () => {},
  };
  let trackState = {
    id: 'trick',
    source: {type: SourceType.URL, url: 'https://example.com/thumbnails.vtt'},
    cutStartTime: 0,
    cutEndTime: undefined,
    playerStartTime: 0,
  } as unknown as MediaContainerTrackState;
  let controller = new TrickTrackControllerImpl(trackState, playerController, domController as unknown as FrameImageSidecarDomController, {warmUpDuration: 2, wakeAhead: 8, keepAwakeAfter: 2});
  await firstValueFrom(controller.loadSource());
  return {controller, domController};
};

describe('TrickTrackController', () => {
  beforeEach(() => {
    mainTime = 30;
    playing = true;
    (playerController as {playbackRate: number}).playbackRate = 1;
  });

  it('stays dormant and hidden at playback rate media elements can play at', async () => {
    let {controller, domController} = await createLoaded();
    // first load only fetches manifest
    expect(domController.loadDuration).toHaveBeenCalled();
    expect(domController.loadSource).not.toHaveBeenCalled();
    expect(controller.active).toBe(false);
    expect(controller.residency).toBe('DORMANT');
    expect(controller.shown).toBe(false);

    setPlaybackRate(2);
    expect(controller.active).toBe(false);
    expect(controller.residency).toBe('DORMANT');
  });

  it('is shown while main media plays backwards or faster than max native playback rate, regardless of main media type', async () => {
    let {controller, domController} = await createLoaded();
    setPlaybackRate(-1);
    expect(controller.active).toBe(true);
    expect(controller.residency).toBe('AWAKE');
    expect(controller.shown).toBe(true);
    expect(domController.loadSource).toHaveBeenCalledWith('https://example.com/thumbnails.vtt', 30);

    setPlaybackRate(32);
    expect(controller.active).toBe(true);
    expect(controller.shown).toBe(true);

    setPlaybackRate(1);
    expect(controller.active).toBe(false);
    expect(controller.residency).toBe('DORMANT');
    expect(controller.shown).toBe(false);
    expect(domController.release).toHaveBeenCalled();
  });

  it('is not shown outside its time window', async () => {
    let {controller} = await createLoaded();
    mainTime = 80;
    setPlaybackRate(-1);
    expect(controller.active).toBe(true);
    expect(controller.shown).toBe(false);
  });

  it('is active once loaded while main media already plays backwards', async () => {
    (playerController as {playbackRate: number}).playbackRate = -1;
    let {controller} = await createLoaded();
    expect(controller.active).toBe(true);
    expect(controller.residency).toBe('AWAKE');
    expect(controller.shown).toBe(true);
  });

  it('can not be activated', async () => {
    let {controller} = await createLoaded();
    controller.setActive(true);
    expect(controller.active).toBe(false);
    expect(controller.residency).toBe('DORMANT');
  });

  it('is never shown while paused, stays awake and follows seeks, shown again once main media plays', async () => {
    let {controller, domController} = await createLoaded();
    setPlaybackRate(-1);
    let shown: boolean[] = [];
    controller.onShown$.subscribe((value) => shown.push(value));

    setPlaying(false);
    expect(controller.shown).toBe(false);
    expect(controller.active).toBe(true);
    expect(controller.residency).toBe('AWAKE');

    // follows seek while hidden
    domController.setClock.mockClear();
    mainTime = 20;
    onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING, data: {fromTime: 30, toTime: 20}} as PlayerControllerEvent);
    expect(domController.setClock).toHaveBeenCalled();
    expect(controller.shown).toBe(false);

    setPlaying(true);
    expect(controller.shown).toBe(true);
    expect(shown).toEqual([true, false, true]);
  });

  it('main media does not wait for it while paused', async () => {
    let {controller, domController} = await createLoaded();
    setPlaybackRate(-1);
    let bufferingRequired: boolean[] = [];
    controller.onBufferingRequired$.subscribe((value) => bufferingRequired.push(value));

    domController.setReady(false);
    setPlaying(false);
    expect(bufferingRequired.at(-1)).toBe(false);
    onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED, data: {currentTime: 30, previousTime: 30}} as PlayerControllerEvent);
    expect(bufferingRequired.at(-1)).toBe(false);
  });
});
