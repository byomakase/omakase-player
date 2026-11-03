// @vitest-environment jsdom
import {describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';

// player-controller-api keeps a side-effect import of the media barrel (verbatimModuleSyntax), which pulls in
// browser-only libraries; dom controller needs only types from it
vi.mock('../../src/media', () => ({}));

import {CompositePlaybackDomController} from '../../src/player/composite-playback-dom-controller';
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType, type PlayerDomController} from '../../src/player/player-controller-api';

const mount = () => {
  let parent = document.createElement('div');
  let videoElement = document.createElement('video');
  videoElement.slot = 'media';
  parent.appendChild(videoElement);
  Object.defineProperty(videoElement, 'buffered', {
    get: () => ({length: 2, start: (index: number) => [10, 40][index], end: (index: number) => [20, 50][index]}),
  });
  let domController = CompositePlaybackDomController.mountAlongside({mainMediaVideoElement: videoElement} as unknown as PlayerDomController);
  return {parent, videoElement, domController, element: domController.element as unknown as HTMLMediaElement};
};

describe('CompositePlaybackDomController', () => {
  it('takes media slot before video element, video element stays visible', () => {
    let {parent, videoElement, domController} = mount();
    expect(parent.firstElementChild).toBe(domController.element);
    expect(domController.element.slot).toBe('media');
    expect(videoElement.style.display).toBe('');
    expect(domController.element.style.pointerEvents).toBe('none');
    expect(domController.element.style.position).toBe('absolute');
    expect(domController.mainMediaVideoElement).toBe(videoElement);

    domController.setVideoPoster('https://example.com/poster.jpg');
    expect(domController.element.style.backgroundImage).not.toContain('poster.jpg');
  });

  it('exposes controller playback and video element buffered time ranges in main media time', () => {
    let {domController, element} = mount();
    let onEvent$ = new Subject<PlayerControllerEvent>();
    let controller = {
      onEvent$: onEvent$.asObservable(),
      getCurrentTime: () => 42,
      getDuration: () => 100,
      playbackRate: -2,
      mediaElementPlayback: {playing: true, ended: false, seeking: false},
    } as unknown as PlayerController;
    domController.setVideoTimeOffset(() => 5);
    domController.attachController(controller);

    expect(element.currentTime).toBe(42);
    expect(element.playbackRate).toBe(-2);
    expect(element.paused).toBe(false);
    expect(element.buffered.length).toBe(2);
    expect(element.buffered.start(1)).toBe(35);
    expect(element.buffered.end(1)).toBe(45);

    let timeupdate = vi.fn();
    element.addEventListener('timeupdate', timeupdate);
    onEvent$.next({type: PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS, data: {currentTime: 42}} as PlayerControllerEvent);
    expect(timeupdate).toHaveBeenCalled();
  });

  it('removes element on destroy, video element is left untouched', () => {
    let {parent, videoElement, domController} = mount();
    domController.destroy();
    expect([...parent.children]).toEqual([videoElement]);
  });
});
