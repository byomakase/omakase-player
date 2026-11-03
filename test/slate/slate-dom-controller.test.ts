// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, Observable} from 'rxjs';

// see slate-player-controller.test.ts
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

import {SlateDomControllerImpl} from '../../src/slate/slate-dom-controller';
import {SlatePlayerController} from '../../src/slate/slate-player-controller';
import type {PlayerDomController} from '../../src/player/player-controller-api';
import type {MainMediaState, MainMediaUpdateableAttrs} from '../../src/media';

const createChromingDomController = () => {
  let themeElement = document.createElement('div');
  let videoElement = document.createElement('video');
  videoElement.slot = 'media';
  themeElement.appendChild(videoElement);
  document.body.appendChild(themeElement);
  let captionsElement = document.createElement('div');
  let domController = {
    mainMediaVideoElement: videoElement,
    textMediaCaptionsElement: captionsElement,
    textImscElement: captionsElement,
    addAlert: vi.fn(),
    removeAlert: vi.fn(),
    prepareForAttaching: vi.fn(),
    prepareForDetaching: vi.fn(),
    setAttachDetachButtonEnabled: vi.fn(),
  } as unknown as PlayerDomController;
  return {themeElement, videoElement, captionsElement, domController};
};

describe('SlateDomControllerImpl', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts over video element and restores it on destroy', () => {
    let {themeElement, videoElement, captionsElement, domController} = createChromingDomController();
    let slate = SlateDomControllerImpl.mountOver(domController);

    expect(slate.element.parentElement).toBe(themeElement);
    // first in media slot, so media-chrome observes slate as media
    expect(themeElement.firstElementChild).toBe(slate.element);
    expect(slate.element.slot).toBe('media');
    expect(videoElement.style.display).toBe('none');
    expect(slate.textMediaCaptionsElement).toBe(captionsElement);
    expect(() => slate.mainMediaVideoElement).toThrow();

    slate.addAlert({id: 'a'} as any);
    expect(domController.addAlert).toHaveBeenCalled();

    slate.destroy();
    expect(slate.element.isConnected).toBe(false);
    expect(videoElement.style.display).toBe('');
  });

  it('mounted controller renders timecode, exposes media element api and destroys its dom controller', async () => {
    let {themeElement, videoElement, domController} = createChromingDomController();
    let controller = SlatePlayerController.createMounted(domController);
    expect(controller.videoElement).toBeUndefined();

    let attrs: MainMediaUpdateableAttrs = {};
    let loadOptions = {duration: 10, frameRate: 25};
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
    let slateElement = themeElement.firstElementChild as HTMLElement & HTMLMediaElement;
    let mediaEvents: string[] = [];
    ['durationchange', 'seeking', 'seeked', 'timeupdate'].forEach((type) => slateElement.addEventListener(type, () => mediaEvents.push(type)));

    expect(Number.isNaN(slateElement.duration)).toBe(true);
    controller.wireEvents({initSegmentTimeOffset: 0, loadOptions, ...attrs} as MainMediaState);
    expect(mediaEvents).toContain('durationchange');
    expect(slateElement.duration).toBe(10);
    expect(slateElement.seekable.length).toBe(1);
    expect(slateElement.seekable.end(0)).toBe(10);
    expect(slateElement.paused).toBe(true);
    expect(slateElement.readyState).toBe(HTMLMediaElement.HAVE_ENOUGH_DATA);

    await firstValueFrom(controller.seekTo(2));
    expect(slateElement.textContent).toBe('00:00:02:00');
    expect(slateElement.currentTime).toBe(2);
    expect(mediaEvents).toEqual(expect.arrayContaining(['seeking', 'seeked', 'timeupdate']));

    // media-chrome seek request sets currentTime on media
    slateElement.currentTime = 4;
    await new Promise((resolve) => setTimeout(resolve));
    expect(controller.getCurrentTime()).toBe(4);

    controller.destroy();
    expect(slateElement.isConnected).toBe(false);
    expect(videoElement.style.display).toBe('');
  });
});
