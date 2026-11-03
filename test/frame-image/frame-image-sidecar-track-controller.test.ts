// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, NEVER, of, Subject} from 'rxjs';

// player-controller-api keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; controller needs only types from it
vi.mock('../../src/media', () => ({}));

import {FrameImageSidecarTrackControllerImpl} from '../../src/frame-image/frame-image-sidecar-track-controller';
import {type FrameImageSidecarClock, FrameImageSidecarDomController} from '../../src/frame-image/frame-image-sidecar-dom-controller';
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType} from '../../src/player/player-controller-api';
import type {MediaContainerTrackState} from '../../src/media';
import {SourceType} from '../../src/source/source';

const onEvent$ = new Subject<PlayerControllerEvent>();
let mainTime = 21;
let mainPlaying = false;
let now = 0;

const playerController = {
  get onEvent$() {
    return onEvent$.asObservable();
  },
  get mediaElementPlayback() {
    return {state: {playing: mainPlaying}, seeking: false};
  },
  getCurrentTime: () => mainTime,
  playbackRate: 1,
} as unknown as PlayerController;

const emit = (type: PlayerControllerEventType, data: object = {}) => onEvent$.next({type, data} as PlayerControllerEvent);

const createLoaded = async () => {
  let clocks: FrameImageSidecarClock[] = [];
  let domController = {
    visible: false,
    duration: 60,
    clock: undefined as FrameImageSidecarClock | undefined,
    loadSource: vi.fn(() => of(void 0)),
    loadDuration: vi.fn(() => of(60)),
    release: vi.fn(),
    setClock: vi.fn((clock: FrameImageSidecarClock) => {
      domController.clock = clock;
      clocks.push(clock);
    }),
    isReady: () => true,
    buffering: false,
    onStatus$: NEVER,
    destroy: () => {},
  };
  let trackState = {
    id: 'frame-image',
    source: {type: SourceType.URL, url: 'https://example.com/thumbnails.vtt'},
    duration: 60,
    cutStartTime: 3,
    cutEndTime: 10,
    playerStartTime: 20,
  } as unknown as MediaContainerTrackState;
  let controller = new FrameImageSidecarTrackControllerImpl(trackState, playerController, domController as unknown as FrameImageSidecarDomController, {
    warmUpDuration: 2,
    wakeAhead: 8,
    keepAwakeAfter: 2,
  });
  await firstValueFrom(controller.loadSource());
  controller.setActive(true);
  return {controller, domController, clocks};
};

describe('FrameImageSidecarTrackController', () => {
  beforeEach(() => {
    mainTime = 21;
    mainPlaying = false;
    now = 0;
    (playerController as {playbackRate: number}).playbackRate = 1;
    vi.spyOn(FrameImageSidecarDomController, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders from clock anchored at sidecar time, clamped to warm-up and time window', async () => {
    let {controller, domController} = await createLoaded();
    expect(controller.residency).toBe('AWAKE');
    expect(domController.clock).toMatchObject({anchorTime: 4, running: false, playbackRate: 1, minTime: 1, maxTime: 10});
  });

  it('anchors clock again when main media plays and pauses', async () => {
    let {domController} = await createLoaded();
    mainPlaying = true;
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAY);
    expect(domController.clock).toMatchObject({anchorTime: 4, running: true, anchorEpoch: 0});

    now = 1000;
    mainTime = 22;
    mainPlaying = false;
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE);
    expect(domController.clock).toMatchObject({anchorTime: 5, running: false});
  });

  it('anchors clock again only when it drifts from main media time', async () => {
    let {domController, clocks} = await createLoaded();
    mainPlaying = true;
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAY);
    let count = clocks.length;

    now = 1000;
    mainTime = 22.02;
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS, {currentTime: mainTime});
    // clock is at sidecar time 5, main media at 5.02
    expect(clocks.length).toBe(count);

    now = 2000;
    mainTime = 23.5;
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS, {currentTime: mainTime});
    expect(clocks.length).toBe(count + 1);
    expect(domController.clock).toMatchObject({anchorTime: 6.5, anchorEpoch: 2000, running: true});
  });

  it('anchors clock at seek target', async () => {
    let {domController} = await createLoaded();
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING, {toTime: 25});
    expect(domController.clock).toMatchObject({anchorTime: 8, running: false});
  });

  it('follows playback direction and rate', async () => {
    let {domController} = await createLoaded();
    (playerController as {playbackRate: number}).playbackRate = -2;
    emit(PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE, {playbackRate: -2});
    // reverse warm-up is after cutEndTime
    expect(domController.clock).toMatchObject({anchorTime: 4, playbackRate: -2, minTime: 3, maxTime: 12});
  });
});

describe('FrameImageSidecarDomController clock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves clock time clamped to clock bounds', () => {
    let now = 0;
    vi.spyOn(FrameImageSidecarDomController, 'now').mockImplementation(() => now);
    let clock: FrameImageSidecarClock = {anchorTime: 5, anchorEpoch: 0, running: true, playbackRate: -2, minTime: 3, maxTime: 10};
    now = 500;
    expect(FrameImageSidecarDomController.resolveClockTime(clock)).toBe(4);
    now = 5000;
    expect(FrameImageSidecarDomController.resolveClockTime(clock)).toBe(3);
    expect(FrameImageSidecarDomController.resolveClockTime({...clock, running: false})).toBe(5);
  });
});
