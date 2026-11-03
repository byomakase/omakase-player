import {describe, expect, it} from 'vitest';
import {Mp4Track} from '../../src/mp4/mp4-track';
import {HlsTrack} from '../../src/hls/hls-track';
import {isMediaContainerTrackType, TrackType} from '../../src/media';
import {UrlSource} from '../../src/source';

describe('MediaContainerTrack', () => {
  const url = 'https://example.com/sidecar.mp4';

  it('defaults cutStartTime and playerStartTime to 0', () => {
    const track = new Mp4Track({source: new UrlSource(url)});
    expect(track.trackType).toBe(TrackType.MP4_TRACK);
    expect(track.url).toBe(url);
    expect(track.timeWindow).toEqual({cutStartTime: 0, cutEndTime: undefined, playerStartTime: 0});
  });

  it('creates HLS container track', () => {
    const track = new HlsTrack({source: new UrlSource('https://example.com/sidecar.m3u8'), cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    expect(track.trackType).toBe(TrackType.HLS_TRACK);
    expect(track.timeWindow).toEqual({cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
  });

  it('keeps time window in state', () => {
    const track = new Mp4Track({source: new UrlSource(url), cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    expect(track.state).toMatchObject({trackType: TrackType.MP4_TRACK, cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
  });

  it('validates time window', () => {
    expect(() => new Mp4Track({source: new UrlSource(url), cutStartTime: -1})).toThrow();
    expect(() => new Mp4Track({source: new UrlSource(url), playerStartTime: -1})).toThrow();
    expect(() => new Mp4Track({source: new UrlSource(url), cutStartTime: 10, cutEndTime: 3})).toThrow();
  });

  it('updates time window and validates it before update', () => {
    const track = new Mp4Track({source: new UrlSource(url), cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    track.updateAttrs({playerStartTime: 30, duration: 60});
    expect(track.state).toMatchObject({cutStartTime: 3, cutEndTime: 10, playerStartTime: 30, duration: 60});

    expect(() => track.updateAttrs({cutEndTime: 2})).toThrow();
    expect(track.timeWindow.cutEndTime).toBe(10);
  });

  it('resets playerStartTime to 0 when updated to undefined', () => {
    const track = new Mp4Track({source: new UrlSource(url), cutStartTime: 3, cutEndTime: 10, playerStartTime: 20});
    track.updateAttrs({playerStartTime: undefined});
    expect(track.timeWindow).toEqual({cutStartTime: 3, cutEndTime: 10, playerStartTime: 0});
  });

  it('resolves media container track types', () => {
    expect(isMediaContainerTrackType(TrackType.MP4_TRACK)).toBe(true);
    expect(isMediaContainerTrackType(TrackType.HLS_TRACK)).toBe(true);
    expect(isMediaContainerTrackType(TrackType.FRAME_IMAGE_TRACK)).toBe(true);
    expect(isMediaContainerTrackType(TrackType.AUDIO)).toBe(false);
    expect(isMediaContainerTrackType(TrackType.TEXT_TRACK)).toBe(false);
  });
});
