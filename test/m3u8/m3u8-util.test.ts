import {afterEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom} from 'rxjs';
import {M3u8Util} from '../../src/m3u8/m3u8-util';

const HEADER = 'WEBVTT\t#Elemental Media Engine(TM) 2.17.1.0\n\n';

const stubSegments = (segments: Record<string, string>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(segments[url], {status: 200}))
  );

const cueCount = (vtt: string | undefined) => (vtt?.match(/-->/g) ?? []).length;

describe('M3u8Util.fetchSegmentedConcat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps cues when leading segments have no cues', async () => {
    stubSegments({
      s1: HEADER,
      s2: HEADER,
      s3: `${HEADER}00:01:30.090 --> 00:01:31.416\nNo, not this time.\n\n`,
      s4: HEADER,
      s5: `${HEADER}00:01:34.291 --> 00:01:39.708\nAnd.. somebody was out there\n\n`,
    });

    let vtt = await firstValueFrom(M3u8Util.fetchSegmentedConcat(['s1', 's2', 's3', 's4', 's5']));

    expect(cueCount(vtt)).toBe(2);
    expect(vtt).toContain('No, not this time.');
    expect(vtt).toContain('And.. somebody was out there');
  });

  it('returns header when no segment has cues', async () => {
    stubSegments({s1: HEADER, s2: HEADER});

    let vtt = await firstValueFrom(M3u8Util.fetchSegmentedConcat(['s1', 's2']));

    expect(vtt?.startsWith('WEBVTT')).toBe(true);
    expect(cueCount(vtt)).toBe(0);
  });
});
