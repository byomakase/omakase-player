// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, of} from 'rxjs';

// player-controller keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; controller needs only types from it
vi.mock('../../src/media', () => ({}));
// validators import player barrel, which pulls in all player controllers
vi.mock('../../src/player', () => ({PlayerTextHandlerType: {}}));
vi.mock('../../src/omakase-audio-context-provider', async () => {
  const {of, Subject} = await import('rxjs');
  return {
    OmakaseAudioContextProvider: {
      instance: {
        onSyncTick$: new Subject<{}>(),
        tryResumeAudioContext: () => of(void 0),
      },
    },
  };
});

import {BasePlayerController, type PlayerControllerConfig} from '../../src/player/player-controller';
import type {PlayerDomController} from '../../src/player/player-controller-api';
import type {MainMediaState} from '../../src/media';

class FakeVideoElement extends EventTarget {
  readonly HAVE_CURRENT_DATA = 2;
  currentTime = 0;
  paused = true;
  ended = false;
  seeking = false;
  readyState = 4;
  /** Nothing buffered by default */
  buffered: {length: number; start: (index: number) => number; end: (index: number) => number} = {length: 0, start: () => 0, end: () => 0};
  playbackRate = 1;
  seeks: number[] = [];

  constructor() {
    super();
    let currentTime = 0;
    Object.defineProperty(this, 'currentTime', {
      get: () => currentTime,
      set: (time: number) => {
        currentTime = time;
        this.seeks.push(time);
      },
    });
  }

  play() {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  requestVideoFrameCallback() {
    return 1;
  }

  cancelVideoFrameCallback() {}
}

class TestPlayerController extends BasePlayerController<PlayerControllerConfig> {
  constructor(playerDomController: PlayerDomController, config: PlayerControllerConfig) {
    super(playerDomController, config);
  }

  loadMainMedia() {
    return of(true);
  }
  resolveAudioTrackIdentifier() {
    return void 0;
  }
  isAudioTrackActive() {
    return false;
  }
  resolveActiveAudioTracks() {
    return [];
  }
  switchAudioTrack() {
    return of(void 0);
  }
  get textTracksDisplayed() {
    return false;
  }
  setTextTracksDisplayed() {}
  resolveTextTrackIdentifier() {
    return void 0;
  }
  isTextTrackActive() {
    return false;
  }
  resolveActiveTextTracks() {
    return [];
  }
  switchTextTrack() {
    return of(void 0);
  }
}

let now = 0;

const create = (config: PlayerControllerConfig = {}) => {
  let video = new FakeVideoElement();
  let playerDomController = {
    mainMediaVideoElement: video,
    textMediaCaptionsElement: document.createElement('div'),
    textImscElement: document.createElement('div'),
    sidecarVideosElement: document.createElement('div'),
    setVideoPoster: () => {},
    resetMainMediaVideoElement: () => {},
  } as unknown as PlayerDomController;
  let controller = new TestPlayerController(playerDomController, config);
  controller.wireEvents({id: 'main', duration: 100, hasVideo: true, hasAudio: true} as unknown as MainMediaState);
  return {controller, video};
};

describe('BasePlayerController playback rate', () => {
  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets playback rate video element can play at', async () => {
    let {controller, video} = create();
    let rate = firstValueFrom(controller.setPlaybackRate(2));
    expect(video.playbackRate).toBe(2);
    video.dispatchEvent(new Event('ratechange'));
    await rate;
    expect(controller.playbackRate).toBe(2);
    expect(controller.seekStepPlayback).toBe(false);
  });

  it('falls back to default playback rate for playback rates video element can not play at, they are played by composite controller', async () => {
    for (let playbackRate of [-1, -0.5, 32]) {
      let {controller, video} = create();
      video.playbackRate = 2;
      let rate = firstValueFrom(controller.setPlaybackRate(playbackRate));
      expect(video.playbackRate).toBe(1);
      video.dispatchEvent(new Event('ratechange'));
      await rate;
      expect(controller.seekStepPlayback).toBe(false);
      expect(video.paused).toBe(true);
      expect(video.seeks).toEqual([]);
    }
  });

  it('falls back to default playback rate for invalid playback rate', async () => {
    for (let playbackRate of [Number.NaN, 0, 0.05]) {
      let {controller, video} = create();
      video.playbackRate = 2;
      let rate = firstValueFrom(controller.setPlaybackRate(playbackRate));
      expect(video.playbackRate).toBe(1);
      video.dispatchEvent(new Event('ratechange'));
      await rate;
    }
  });
});
