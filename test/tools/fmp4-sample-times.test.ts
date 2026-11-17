import {describe, expect, it} from 'vitest';
import {Fmp4SampleTimes} from '../../src/tools/fmp4-sample-times';

const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const i32 = (value: number) => u32(value >>> 0);
const u64 = (value: number) => [...u32(Math.floor(value / 2 ** 32)), ...u32(value % 2 ** 32)];
const fourCc = (type: string) => Array.from(type).map((p) => p.charCodeAt(0));
const box = (type: string, ...payload: number[][]) => {
  let body = payload.flat();
  return [...u32(8 + body.length), ...fourCc(type), ...body];
};
const fullBox = (type: string, version: number, flags: number, ...payload: number[][]) => box(type, [version, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff], ...payload);

const trak = (trackId: number, handler: string, timescale: number, withEditList: boolean) =>
  box(
    'trak',
    fullBox('tkhd', 0, 3, u32(0), u32(0), u32(trackId), u32(0), u32(0)),
    // empty edit of 10 s, then media from 1024, ignored by MSE
    withEditList ? box('edts', fullBox('elst', 0, 0, u32(2), u32(10000), i32(-1), u32(0x10000), u32(0), i32(1024), u32(0x10000))) : [],
    box('mdia', fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(0), u32(0)), fullBox('hdlr', 0, 0, u32(0), fourCc(handler), u32(0), u32(0), u32(0), [0]))
  );

const init = (defaultSampleDuration: number) =>
  new Uint8Array([
    ...box('ftyp', fourCc('iso6'), u32(0)),
    ...box(
      'moov',
      fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0)),
      trak(1, 'soun', 48000, false),
      trak(2, 'vide', 12800, true),
      box('mvex', fullBox('trex', 0, 0, u32(2), u32(1), u32(defaultSampleDuration), u32(0), u32(0)))
    ),
  ]);

/** Video track fragment with sample durations from trex and composition offsets, samples in decode order I P B B */
const segment = (baseMediaDecodeTime: number, compositionOffsets: number[], tfdtVersion = 1) =>
  new Uint8Array([
    ...box('styp', fourCc('msdh')),
    ...box(
      'moof',
      fullBox('mfhd', 0, 0, u32(1)),
      box('traf', fullBox('tfhd', 0, 0x20000, u32(1)), fullBox('tfdt', 1, 0, u64(0)), fullBox('trun', 0, 0x1, u32(1), u32(0), u32(0))),
      box(
        'traf',
        fullBox('tfhd', 0, 0x20000, u32(2)),
        tfdtVersion === 1 ? fullBox('tfdt', 1, 0, u64(baseMediaDecodeTime)) : fullBox('tfdt', 0, 0, u32(baseMediaDecodeTime)),
        fullBox('trun', 1, 0x1 | 0x800, u32(compositionOffsets.length), u32(0), ...compositionOffsets.map((p) => i32(p)))
      )
    ),
    ...box('mdat', [0, 0, 0, 0]),
  ]);

describe('Fmp4SampleTimes', () => {
  it('resolves lowest video presentation time from decode time and composition offsets, ignoring edit list', () => {
    // 25 fps, sample duration 512, presentation order shifted by 2 frames
    let time = Fmp4SampleTimes.getFirstVideoFrameTime(init(512), segment(0, [1024, 2560, 1536, 1024]));
    expect(time).toBeCloseTo(0.08, 9);
  });

  it('adds base media decode time of video track fragment', () => {
    let time = Fmp4SampleTimes.getFirstVideoFrameTime(init(512), segment(12800 * 10 - 1024, [1024, 2560, 1536, 1024], 0));
    expect(time).toBeCloseTo(10, 9);
  });

  it('takes lowest presentation time when it is not the first sample in decode order', () => {
    let time = Fmp4SampleTimes.getFirstVideoFrameTime(init(512), segment(0, [1024, -512, 0]));
    expect(time).toBeCloseTo(0, 9);
  });

  it('returns undefined without video track', () => {
    expect(Fmp4SampleTimes.getFirstVideoFrameTime(new Uint8Array(box('ftyp', fourCc('iso6'))), segment(0, [0]))).toBeUndefined();
  });
});
