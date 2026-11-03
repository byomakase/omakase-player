// @vitest-environment jsdom

import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // media-captions extends window.VTTCue, which jsdom does not provide
  if (typeof (globalThis as any).VTTCue === 'undefined') {
    (globalThis as any).VTTCue = class {
      constructor(
        public startTime: number,
        public endTime: number,
        public text: string
      ) {}
    };
  }
  if (typeof globalThis.matchMedia === 'undefined') {
    (globalThis as any).matchMedia = () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
});
import {firstValueFrom} from 'rxjs';
import {MediaFactory} from '../../src/media/media-factory';
import {DISABLED_SIDECAR_VIDEO_TRACK_TYPES, TrackType} from '../../src/media';
import {UrlSource} from '../../src/source';
import {FileFormatType} from '../../src/common';
import {HlsTrack} from '../../src/hls/hls-track';
import {Mp4Track} from '../../src/mp4/mp4-track';
import {FrameImageTrack} from '../../src/frame-image/frame-image-track';
import {TrickTrack} from '../../src/frame-image/trick-track';
import type {TrackLoadOptions} from '../../src/track';

describe('MediaFactory container tracks', () => {
  it.skipIf(DISABLED_SIDECAR_VIDEO_TRACK_TYPES.includes(TrackType.HLS_TRACK))('creates HlsTrack for explicit HLS_TRACK', async () => {
    const track = await firstValueFrom(
      MediaFactory.createSidecarTrack(new UrlSource('https://example.com/sidecar.m3u8'), {
        trackType: TrackType.HLS_TRACK,
        fileFormatType: FileFormatType.HLS,
        args: {cutStartTime: 3, cutEndTime: 10, playerStartTime: 20},
      })
    );
    expect(track).toBeInstanceOf(HlsTrack);
    expect(track.state).toMatchObject({trackType: TrackType.HLS_TRACK, cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
  });

  it.skipIf(DISABLED_SIDECAR_VIDEO_TRACK_TYPES.includes(TrackType.MP4_TRACK))('creates Mp4Track for explicit MP4_TRACK', async () => {
    const track = await firstValueFrom(
      MediaFactory.createSidecarTrack(new UrlSource('https://example.com/sidecar.mp4'), {
        trackType: TrackType.MP4_TRACK,
        fileFormatType: FileFormatType.MP4,
      })
    );
    expect(track).toBeInstanceOf(Mp4Track);
  });

  it('creates FrameImageTrack for explicit FRAME_IMAGE_TRACK', async () => {
    const track = await firstValueFrom(
      MediaFactory.createSidecarTrack(new UrlSource('https://example.com/thumbnails.vtt'), {
        trackType: TrackType.FRAME_IMAGE_TRACK,
        fileFormatType: FileFormatType.VTT,
        args: {cutStartTime: 3, cutEndTime: 10, playerStartTime: 20},
      })
    );
    expect(track).toBeInstanceOf(FrameImageTrack);
    expect(track.state).toMatchObject({trackType: TrackType.FRAME_IMAGE_TRACK, cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
  });

  it('creates TrickTrack for explicit TRICK_TRACK, time window defaults to whole main media', async () => {
    const track = await firstValueFrom(MediaFactory.createSidecarTrack(new UrlSource('https://example.com/thumbnails.vtt'), {trackType: TrackType.TRICK_TRACK, fileFormatType: FileFormatType.VTT}));
    expect(track).toBeInstanceOf(TrickTrack);
    expect(track).toBeInstanceOf(FrameImageTrack);
    expect(track.state).toMatchObject({trackType: TrackType.TRICK_TRACK, cutStartTime: 0, playerStartTime: 0});
  });

  it('does not resolve FRAME_IMAGE_TRACK from VTT file format', async () => {
    const track = await firstValueFrom(MediaFactory.createSidecarTrack(new UrlSource('https://example.com/thumbnails.vtt'), {fileFormatType: FileFormatType.VTT}));
    expect(track).not.toBeInstanceOf(FrameImageTrack);
  });

  it('rejects file format not compatible with container track type', () => {
    expect(() =>
      MediaFactory.createSidecarTrack(new UrlSource('https://example.com/sidecar.mp4'), {
        trackType: TrackType.HLS_TRACK,
        fileFormatType: FileFormatType.MP4,
      })
    ).toThrow();
  });

  it.each(DISABLED_SIDECAR_VIDEO_TRACK_TYPES)('rejects temporarily disabled sidecar video track type %s', (trackType) => {
    expect(() => MediaFactory.createSidecarTrack(new UrlSource('https://example.com/sidecar'), {trackType} as TrackLoadOptions)).toThrow(/not supported yet/);
  });

  it('does not resolve container track types from file format', () => {
    // HLS has no other sidecar track type, container track has to be requested explicitly
    expect(() => MediaFactory.createSidecarTrack(new UrlSource('https://example.com/sidecar.m3u8'), {fileFormatType: FileFormatType.HLS})).toThrow();
  });
});
