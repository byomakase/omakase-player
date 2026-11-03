// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {FrameImageCacheImpl} from '../../src/frame-image/frame-image-cache';
import {FRAME_IMAGE_CONFIG_DEFAULT, FrameImageWindowUtil} from '../../src/frame-image/frame-image-window';
import type {FrameImage} from '../../src/frame-image/frame-image-player-controller';

const createFrameImages = (frameImageDuration: number, duration: number): FrameImage[] =>
  Array.from({length: Math.round(duration / frameImageDuration)}, (_, i) => ({start: i * frameImageDuration, end: (i + 1) * frameImageDuration, url: `https://example.com/${i}.jpg`}));

/**
 * Plays 10 seconds of wall clock at 60 animation frames per second, with fetch and decode windows resolved as frame image sidecar does,
 * from time running linearly. Fetches never complete.
 */
const playLinear = (playbackRate: number, frameImageDuration: number) => {
  let fetches = 0;
  let aborts = 0;
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    fetches++;
    init.signal?.addEventListener('abort', () => aborts++);
    return new Promise(() => {});
  });
  let frameImages = createFrameImages(frameImageDuration, 200);
  let cache = new FrameImageCacheImpl({decode: () => new Promise(() => {})});
  cache.setFrameImages(frameImages);
  let windowIndex = -1;
  let renderedIndices = new Set<number>();
  for (let frame = 0; frame <= 600; frame++) {
    let time = 50 + (frame / 60) * playbackRate;
    let stride = FrameImageWindowUtil.resolveLinearStride(frameImages[cache.indexAt(time)]!, time, playbackRate, true);
    let index = cache.indexAt(stride.base);
    renderedIndices.add(index);
    if (index === windowIndex) {
      continue;
    }
    windowIndex = index;
    cache.setFetchTimes(FrameImageWindowUtil.resolveFetchTimes(stride, FRAME_IMAGE_CONFIG_DEFAULT));
    cache.setDecodeTimes(FrameImageWindowUtil.resolveDecodeTimes(stride, FRAME_IMAGE_CONFIG_DEFAULT));
  }
  return {fetches, aborts, renderedIndices};
};

describe('FrameImageWindowUtil', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves linear stride snapped to stride grid above 1x', () => {
    let frameImage = {start: 50, end: 50.04, url: ''};
    let stride = FrameImageWindowUtil.resolveLinearStride(frameImage, 50.01, 2, true);
    expect(stride.stride).toBeCloseTo(0.08);
    expect(stride.base).toBeCloseTo(50.02);
    // next frame image is inside the same stride step
    expect(FrameImageWindowUtil.resolveLinearStride({start: 50.04, end: 50.08, url: ''}, 50.05, 2, true).base).toBeCloseTo(50.02);
    expect(FrameImageWindowUtil.resolveLinearStride({start: 50.08, end: 50.12, url: ''}, 50.09, 2, true).base).toBeCloseTo(50.1);
  });

  it('resolves linear stride as frame image stride at 1x and while paused', () => {
    let frameImage = {start: 50, end: 50.04, url: ''};
    let frameImageDuration = frameImage.end - frameImage.start;
    expect(FrameImageWindowUtil.resolveLinearStride(frameImage, 50.01, 1, true)).toEqual(FrameImageWindowUtil.resolveStride(frameImage, 50.01, frameImageDuration, 1, true));
    expect(FrameImageWindowUtil.resolveLinearStride(frameImage, 50.01, 4, false)).toEqual(FrameImageWindowUtil.resolveStride(frameImage, 50.01, frameImageDuration, 4, false));
  });

  it('fetches about as many frame images above 1x as at 1x when time runs linearly', () => {
    let normal = playLinear(1, 0.04);
    let fast = playLinear(2, 0.04);
    let faster = playLinear(4, 0.04);
    let reverse = playLinear(-2, 0.04);
    let fewerFrameImages = playLinear(2, 0.2);
    expect(normal.fetches).toBeLessThan(600);
    // fetch window moves by one stride step, not alternating between skipped and not skipped frame images
    expect(fast.fetches).toBeLessThanOrEqual(normal.fetches);
    expect(faster.fetches).toBeLessThanOrEqual(normal.fetches);
    expect(reverse.fetches).toBeLessThanOrEqual(normal.fetches);
    expect(fewerFrameImages.fetches).toBeLessThan(200);
    expect(fast.aborts).toBeLessThan(400);
    // every other frame image is rendered at 2x
    expect([...fast.renderedIndices].every((index) => index % 2 === [...fast.renderedIndices][0]! % 2)).toBe(true);
  });
});
