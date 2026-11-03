// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, type Observable, of, Subject, throwError} from 'rxjs';

// player-controller-api keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; controller needs only types from it
vi.mock('../../src/media', () => ({}));

import {SidecarVideoTrackControllerImpl} from '../../src/video/sidecar-video-track-controller';
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType} from '../../src/player/player-controller-api';
import type {SidecarVideoDomController} from '../../src/video/sidecar-video-dom-controller';
import {SidecarVideoAwakeBudget} from '../../src/video/sidecar-video-awake-budget';
import type {MediaContainerTrackState} from '../../src/media';
import {SourceType} from '../../src/source/source';

class FakeVideoElement extends EventTarget {
  readonly HAVE_FUTURE_DATA = 3;
  currentTime = 0;
  duration = 60;
  paused = true;
  muted = false;
  readyState = 4;
  /** Nothing buffered */
  buffered = {length: 0, start: () => 0, end: () => 0};
  protected _playbackRate = 1;

  get playbackRate() {
    return this._playbackRate;
  }

  /** Browsers don't support negative playback rate on video element */
  set playbackRate(playbackRate: number) {
    if (playbackRate < 0) {
      throw new Error(`NotSupportedError: playbackRate=${playbackRate}`);
    }
    this._playbackRate = playbackRate;
  }
  seeking = false;

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

const onEvent$ = new Subject<PlayerControllerEvent>();
let mainTime = 0;
let mainPlaying = false;

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

/** Advances main media, as playback progress */
const progress = (time: number) => {
  mainTime = time;
  onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS, data: {currentTime: time}} as PlayerControllerEvent);
};

const seek = (toTime: number) => {
  onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKING, data: {toTime}} as PlayerControllerEvent);
  mainTime = toTime;
  onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED, data: {currentTime: toTime}} as PlayerControllerEvent);
};

const setPlaybackRate = (playbackRate: number) => {
  (playerController as {playbackRate: number}).playbackRate = playbackRate;
  onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_RATE_UPDATE, data: {playbackRate}} as PlayerControllerEvent);
};

const play = () => {
  mainPlaying = true;
  onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAY, data: {currentTime: mainTime}} as PlayerControllerEvent);
};

interface CreateLoadedOptions {
  /** Load of waking sidecar, loads synchronously by default */
  restore?: (startTime: number) => Observable<void>;
  /** Duration from track state, first load is skipped */
  duration?: number;
  metadataLoad?: boolean;
  awakeBudget?: SidecarVideoAwakeBudget;
  /** Minimum milliseconds between seek steps, 0 by default so that seek steps follow main media time only */
  minSeekInterval?: number;
}

/** First load is synchronous, element is at start time once loaded */
const createLoaded = async (timeWindow: {cutStartTime: number; cutEndTime?: number; playerStartTime: number}, options: CreateLoadedOptions = {}) => {
  let video = new FakeVideoElement();
  let release = vi.fn(() => video.pause());
  let loadDuration = vi.fn(() => of(60));
  // loads after first load wake sidecar up
  let restoreSpy = vi.fn((startTime: number) => (options.restore ? options.restore(startTime) : of(void 0)));
  let firstLoad = true;
  let loadSource = vi.fn((url: string, startTime?: number) => {
    video.currentTime = startTime ?? 0;
    if (firstLoad) {
      firstLoad = false;
      return of(void 0);
    }
    return restoreSpy(startTime!);
  });
  let domController = {
    videoElement: video,
    bufferedTimeRanges: [],
    loadSource: loadSource,
    loadDuration: loadDuration,
    release: release,
    destroy: () => {},
  } as unknown as SidecarVideoDomController;
  if (options.duration !== undefined || options.metadataLoad) {
    // no first media load, every load wakes sidecar up
    firstLoad = false;
  }
  let trackState = {
    id: 'sidecar',
    source: {type: SourceType.URL, url: 'https://example.com/sidecar.mp4'},
    duration: options.duration,
    ...timeWindow,
  } as unknown as MediaContainerTrackState;
  let controller = new SidecarVideoTrackControllerImpl(trackState, playerController, domController, {
    warmUpDuration: 2,
    wakeAhead: 8,
    keepAwakeAfter: 2,
    metadataLoad: !!options.metadataLoad,
    seekStep: 2,
    minSeekInterval: options.minSeekInterval ?? 0,
    ...(options.awakeBudget ? {awakeBudget: options.awakeBudget} : {}),
  });
  await firstValueFrom(controller.loadSource());
  let bufferingRequired = false;
  controller.onBufferingRequired$.subscribe((value) => (bufferingRequired = value));
  return {controller, video, release, restore: restoreSpy, loadSource, loadDuration, isBufferingRequired: () => bufferingRequired};
};

describe('SidecarVideoTrackController', () => {
  beforeEach(() => {
    mainTime = 0;
    mainPlaying = false;
    (playerController as {playbackRate: number}).playbackRate = 1;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warms up in warm-up and inside time window while inactive', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    play();
    progress(10);
    expect(controller.warmingUp).toBe(false);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(1);

    progress(18);
    expect(controller.warmingUp).toBe(true);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(true);

    video.currentTime = 4;
    progress(21);
    expect(controller.active).toBe(false);
    expect(controller.shown).toBe(false);
    expect(controller.warmingUp).toBe(true);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(true);

    progress(27);
    expect(controller.warmingUp).toBe(false);
    expect(video.paused).toBe(true);
    expect(video.muted).toBe(false);
  });

  it('is shown with sound without seeking when activated while warming up inside time window', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    play();
    progress(18);
    video.currentTime = 4;
    progress(21);
    controller.setActive(true);
    expect(controller.shown).toBe(true);
    expect(controller.warmingUp).toBe(false);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(4);
  });

  it('holds warm-up start frame before warm-up', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    controller.setActive(true);
    play();
    progress(10);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(1);
    expect(controller.shown).toBe(false);
    expect(controller.warmingUp).toBe(false);
  });

  it('plays hidden and muted in warm-up, then shown with sound inside time window', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    controller.setActive(true);
    play();
    progress(18);
    expect(controller.warmingUp).toBe(true);
    expect(controller.shown).toBe(false);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(1);

    video.currentTime = 3;
    progress(20);
    expect(controller.warmingUp).toBe(false);
    expect(controller.shown).toBe(true);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(false);

    progress(27);
    expect(controller.shown).toBe(false);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(10);
  });

  it('keeps muted state when sidecar was muted before warm-up', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    video.muted = true;
    controller.setActive(true);
    play();
    progress(19);
    video.currentTime = 3;
    progress(20);
    expect(video.muted).toBe(true);
  });

  it('has no warm-up when cut starts at sidecar start', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 0, cutEndTime: 10, playerStartTime: 20});
    controller.setActive(true);
    play();
    progress(19);
    expect(controller.warmingUp).toBe(false);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);
    progress(20);
    expect(controller.shown).toBe(true);
    expect(video.paused).toBe(false);
  });

  it('hides and keeps warming up once deactivated inside time window', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    controller.setActive(true);
    play();
    progress(19);
    video.currentTime = 4;
    progress(21);
    expect(controller.shown).toBe(true);
    expect(video.muted).toBe(false);

    controller.setActive(false);
    expect(controller.shown).toBe(false);
    expect(controller.warmingUp).toBe(true);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(true);
  });

  it('seeks to main media time when activated inside time window', async () => {
    let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    mainTime = 25;
    controller.setActive(true);
    expect(controller.shown).toBe(true);
    expect(video.currentTime).toBe(8);
  });

  describe('dormancy', () => {
    // time window 20 - 27, warm-up from 18, awake from 10 to 29, released before 8 and from 31

    it('is released when loaded far from time window and woken up ahead of warm-up', async () => {
      let {controller, release, restore} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      expect(controller.residency).toBe('DORMANT');
      expect(release).toHaveBeenCalledTimes(1);

      play();
      progress(9);
      expect(controller.residency).toBe('DORMANT');
      expect(restore).not.toHaveBeenCalled();

      progress(10);
      expect(controller.residency).toBe('AWAKE');
      // loaded from warm-up start frame
      expect(restore).toHaveBeenCalledWith(1);
    });

    it('stays awake when loaded near time window', async () => {
      mainTime = 12;
      let {controller, release} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      expect(controller.residency).toBe('AWAKE');
      expect(release).not.toHaveBeenCalled();
    });

    it('is released after time window with hysteresis', async () => {
      mainTime = 12;
      let {controller, video, release} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      play();
      progress(18);
      video.currentTime = 3;
      progress(20);
      expect(controller.shown).toBe(true);

      progress(30);
      expect(controller.residency).toBe('AWAKE');
      progress(31);
      expect(controller.residency).toBe('DORMANT');
      expect(release).toHaveBeenCalledTimes(1);
      expect(controller.shown).toBe(false);
      expect(controller.warmingUp).toBe(false);
    });

    it('keeps duration once released', async () => {
      let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      video.duration = NaN;
      expect(controller.residency).toBe('DORMANT');
      expect(controller.duration).toBe(60);
    });

    it('requires buffering while active sidecar inside time window is waking up, and is shown once awake', async () => {
      let restored$ = new Subject<void>();
      let {controller, video, restore, isBufferingRequired} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {restore: () => restored$});
      controller.setActive(true);
      seek(25);
      expect(restore).toHaveBeenCalledWith(8);
      expect(controller.residency).toBe('WAKING');
      expect(controller.shown).toBe(false);
      expect(isBufferingRequired()).toBe(true);

      restored$.next();
      restored$.complete();
      expect(controller.residency).toBe('AWAKE');
      expect(controller.shown).toBe(true);
      expect(video.currentTime).toBe(8);
      expect(isBufferingRequired()).toBe(false);
    });

    it('does not require buffering when waking up fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      let {controller, isBufferingRequired} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {restore: () => throwError(() => new Error('failed'))});
      controller.setActive(true);
      seek(25);
      expect(controller.residency).toBe('DORMANT');
      expect(controller.shown).toBe(false);
      expect(isBufferingRequired()).toBe(false);
    });

    it('cancels waking up when released', async () => {
      let restored$ = new Subject<void>();
      let {controller} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {restore: () => restored$});
      seek(15);
      expect(controller.residency).toBe('WAKING');
      seek(100);
      expect(controller.residency).toBe('DORMANT');
      restored$.next();
      expect(controller.residency).toBe('DORMANT');
    });
  });

  describe('seek watchdog', () => {
    it('seeks again, then reloads active sidecar stuck seeking inside time window', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mainTime = 25;
      let {controller, video, release, restore, isBufferingRequired} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      video.seeking = true;
      video.currentTime = 100;
      video.dispatchEvent(new Event('waiting'));
      expect(isBufferingRequired()).toBe(true);

      vi.advanceTimersByTime(2200);
      expect(video.currentTime).toBe(8);
      expect(release).not.toHaveBeenCalled();

      video.currentTime = 100;
      vi.advanceTimersByTime(2200);
      expect(release).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledWith(8);
      expect(controller.residency).toBe('AWAKE');

      video.seeking = false;
      vi.advanceTimersByTime(200);
      expect(isBufferingRequired()).toBe(false);
    });
  });

  describe('first load', () => {
    it('skips loading when duration is known and wakes up near time window', async () => {
      let {controller, loadSource, loadDuration} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {duration: 45});
      expect(loadSource).not.toHaveBeenCalled();
      expect(loadDuration).not.toHaveBeenCalled();
      expect(controller.residency).toBe('DORMANT');
      expect(controller.duration).toBe(45);

      play();
      progress(10);
      expect(controller.residency).toBe('AWAKE');
      expect(loadSource).toHaveBeenCalledWith('https://example.com/sidecar.mp4', 1);
    });

    it('loads only duration with metadata load', async () => {
      let {controller, loadSource, loadDuration} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {metadataLoad: true});
      expect(loadDuration).toHaveBeenCalledTimes(1);
      expect(loadSource).not.toHaveBeenCalled();
      expect(controller.residency).toBe('DORMANT');
      expect(controller.duration).toBe(60);
    });

    it('wakes up right after metadata load near time window', async () => {
      mainTime = 15;
      let {controller, loadSource} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {metadataLoad: true});
      expect(controller.residency).toBe('AWAKE');
      expect(loadSource).toHaveBeenCalledWith('https://example.com/sidecar.mp4', 1);
    });

    it('fails when time window is out of known duration', async () => {
      await expect(createLoaded({cutStartTime: 50, cutEndTime: 60, playerStartTime: 20}, {duration: 45})).rejects.toBeDefined();
    });
  });

  describe('awake budget', () => {
    it('keeps sidecar closer to main media time awake and wakes the other once slot is free', async () => {
      let awakeBudget = new SidecarVideoAwakeBudget(1, 1);
      mainTime = 12;
      // warm-up from 18, and from 28
      let near = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {duration: 60, awakeBudget});
      let far = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 30}, {duration: 60, awakeBudget});
      expect(near.controller.residency).toBe('AWAKE');
      expect(far.controller.residency).toBe('DORMANT');

      play();
      progress(26);
      // far is closer now, near is still inside time window
      expect(far.controller.residency).toBe('DORMANT');

      progress(31);
      // near released after time window, far takes free slot
      expect(near.controller.residency).toBe('DORMANT');
      await Promise.resolve();
      expect(far.controller.residency).toBe('AWAKE');
    });

    it('active sidecar inside time window takes slot of awake one', async () => {
      let awakeBudget = new SidecarVideoAwakeBudget(1, 1);
      mainTime = 19;
      // first is warming up, second has no warm-up and starts in 0.5s, not closer than first by preempt margin
      let first = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {duration: 60, awakeBudget});
      let second = await createLoaded({cutStartTime: 0, cutEndTime: 10, playerStartTime: 19.5}, {duration: 60, awakeBudget});
      expect(first.controller.residency).toBe('AWAKE');
      expect(second.controller.residency).toBe('DORMANT');

      mainTime = 20;
      second.controller.setActive(true);
      expect(second.controller.residency).toBe('AWAKE');
      expect(second.controller.shown).toBe(true);
      expect(first.controller.residency).toBe('DORMANT');
      expect(first.release).toHaveBeenCalled();
    });
  });

  describe('reverse playback', () => {
    it('stays paused and seeks every reverse seek step while main media plays backwards', async () => {
      mainTime = 26;
      let {controller, video, isBufferingRequired} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      play();
      setPlaybackRate(-1);
      progress(26);
      expect(video.paused).toBe(true);
      // seek step leads main media by seek step in playback direction, main media 24 is sidecar 7
      expect(video.currentTime).toBe(7);
      expect(controller.shown).toBe(true);

      video.seeking = true;
      progress(25);
      // less than reverse seek step from last seek
      expect(video.currentTime).toBe(7);
      // main media doesn't wait for seeks while it plays backwards
      expect(isBufferingRequired()).toBe(false);

      video.seeking = false;
      progress(24);
      expect(video.currentTime).toBe(5);
      expect(video.paused).toBe(true);
      expect(isBufferingRequired()).toBe(false);
    });

    it('seeks in steps scaled by playback rate above max native playback rate, clamped to time window', async () => {
      mainTime = 5;
      let {controller, video} = await createLoaded({cutStartTime: 0, cutEndTime: 60, playerStartTime: 0});
      controller.setActive(true);
      play();
      setPlaybackRate(20);
      progress(5);
      // seek step is 40 seconds at 20x
      expect(video.paused).toBe(true);
      expect(video.currentTime).toBe(45);
      expect(video.playbackRate).toBe(1);

      progress(25);
      expect(video.currentTime).toBe(45);

      progress(45);
      // lead main media time 85 is clamped to cutEndTime
      expect(video.currentTime).toBe(60);
    });

    it('does not overlap seek steps, seeks to latest time once video element is done seeking', async () => {
      mainTime = 26;
      let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      play();
      setPlaybackRate(-1);
      progress(26);
      expect(video.currentTime).toBe(7);

      video.seeking = true;
      progress(23);
      // seek step reached, still seeking to 7
      expect(video.currentTime).toBe(7);

      video.seeking = false;
      progress(22);
      expect(video.currentTime).toBe(3);
    });

    it('holds frame at main media time while main media is paused with negative playback rate', async () => {
      mainTime = 26;
      let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      setPlaybackRate(-1);
      seek(25.5);
      expect(video.paused).toBe(true);
      expect(video.currentTime).toBe(8.5);
    });

    it('plays again once main media plays forward', async () => {
      mainTime = 26;
      let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      play();
      setPlaybackRate(-2);
      progress(24);
      expect(video.paused).toBe(true);

      setPlaybackRate(1);
      progress(23);
      expect(video.paused).toBe(false);
      expect(video.playbackRate).toBe(1);
      expect(video.currentTime).toBe(6);
    });

    it('warms up after time window end, not before its start, while main media plays backwards', async () => {
      mainTime = 30;
      let {controller, video} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
      controller.setActive(true);
      play();
      setPlaybackRate(-1);
      progress(28.5);
      expect(controller.warmingUp).toBe(true);
      expect(controller.shown).toBe(false);
      expect(video.paused).toBe(true);
      // seek step leads main media into time window
      expect(video.currentTime).toBe(9.5);

      progress(26);
      expect(controller.warmingUp).toBe(false);
      expect(controller.shown).toBe(true);
      expect(video.currentTime).toBe(7);

      progress(19);
      // left time window at its start, no warm-up before playerStartTime in reverse
      expect(controller.warmingUp).toBe(false);
      expect(controller.shown).toBe(false);
      expect(video.currentTime).toBe(3);
    });

    it('does not make main media wait while waking up at playback rate video element can not play at', async () => {
      mainTime = 24;
      let waking = new Subject<void>();
      let {controller, isBufferingRequired} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {duration: 60, restore: () => waking});
      controller.setActive(true);
      // regular playback, main media waits for active sidecar waking up inside its time window
      expect(controller.residency).toBe('WAKING');
      expect(isBufferingRequired()).toBe(true);

      play();
      setPlaybackRate(-1);
      expect(controller.residency).toBe('WAKING');
      expect(isBufferingRequired()).toBe(false);

      setPlaybackRate(32);
      expect(isBufferingRequired()).toBe(false);

      setPlaybackRate(1);
      expect(isBufferingRequired()).toBe(true);
    });

    it('wakes ahead of time window end while main media plays backwards', async () => {
      mainTime = 34;
      let {controller} = await createLoaded({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20}, {duration: 60});
      expect(controller.residency).toBe('DORMANT');

      play();
      setPlaybackRate(-1);
      progress(34);
      expect(controller.residency).toBe('AWAKE');
    });
  });
});
