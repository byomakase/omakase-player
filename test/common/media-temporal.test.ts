import {beforeEach, describe, expect, it} from 'vitest';
import {MediaTemporalConverter, MediaTemporalFormat} from '../../src/common/media-temporal';
import {type FrameRateModel, FrameRateResolver} from '../../src/common/frame-rate';
import {TimecodeConverter, type TimecodeModel} from '../../src/common/timecode';

const DURATION = 8400; // 2h 20min in seconds
const INIT_SEGMENT = 0.08;

const FPS_23_976 = FrameRateResolver.resolveFrameRateModel('24000/1001');
const FPS_25 = FrameRateResolver.resolveFrameRateModel(25);
const FPS_29_97_NDF = FrameRateResolver.resolveFrameRateModel('30000/1001', false);
const FPS_29_97_DF = FrameRateResolver.resolveFrameRateModel('30000/1001', true);
const FPS_59_94_DF = FrameRateResolver.resolveFrameRateModel('60000/1001', true);

interface SecondsTestCase {
  seconds: number;
  frame?: number;
  percent?: number;
  timecode?: string;
  mediaTime?: string;
  countdownMediaTime?: string;
}

const secondsTestData_23_976: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '00:00:00:00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '00:00:00:00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 11,
    percent: 0.005952,
    timecode: '00:00:00:11',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '00:00:29:23',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 18341,
    timecode: '00:12:44:05',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '00:54:56:16',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 102137,
    percent: 50.714286,
    timecode: '01:10:55:17',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '02:19:51:14',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_23_976_ffom: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '01:00:00:00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '01:00:00:00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 11,
    percent: 0.005952,
    timecode: '01:00:00:11',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '01:00:29:23',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 18341,
    timecode: '01:12:44:05',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '01:54:56:16',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 102137,
    percent: 50.714286,
    timecode: '02:10:55:17',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '03:19:51:14',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_25: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '00:00:00:00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '00:00:00:00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 12,
    percent: 0.005952,
    timecode: '00:00:00:12',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '00:00:30:00',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 19125,
    timecode: '00:12:45:00',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '00:55:00:00',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 106500,
    percent: 50.714286,
    timecode: '01:11:00:00',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '02:20:00:00',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_29_97_DF: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '00:00:00;00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '00:00:00;00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 14,
    percent: 0.005952,
    timecode: '00:00:00;14',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '00:00:29;29',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 22927,
    timecode: '00:12:44;29',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '00:54:59;29',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 127672,
    percent: 50.714286,
    timecode: '01:10:59;28',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '02:20:00;00',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_29_97_DF_initSeg: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '00:00:00;00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '00:00:00;00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 12,
    percent: 0.005952,
    timecode: '00:00:00;12',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '00:00:29;26',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 22924,
    timecode: '00:12:44;26',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '00:54:59;26',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 127669,
    percent: 50.714286,
    timecode: '01:10:59;25',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '02:19:59;27',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_29_97_DF_ffom: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '01:00:00;00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '01:00:00;00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 14,
    percent: 0.005952,
    timecode: '01:00:00;14',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '01:00:29;29',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 22927,
    timecode: '01:12:44;29',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '01:54:59;29',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 127672,
    percent: 50.714286,
    timecode: '02:10:59;28',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '03:20:00;00',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_29_97_DF_initSeg_ffom: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '01:00:00;00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '01:00:00;00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 12,
    percent: 0.005952,
    timecode: '01:00:00;12',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '01:00:29;26',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 22924,
    timecode: '01:12:44;26',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '01:54:59;26',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 127669,
    percent: 50.714286,
    timecode: '02:10:59;25',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '03:19:59;27',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_59_94_DF: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '00:00:00;00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '00:00:00;00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 29,
    percent: 0.005952,
    timecode: '00:00:00;29',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '00:00:29;58',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 45854,
    timecode: '00:12:44;58',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '00:54:59;58',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 255344,
    percent: 50.714286,
    timecode: '01:10:59;56',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '02:20:00;00',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

const secondsTestData_59_94_DF_initSeg_ffom: SecondsTestCase[] = [
  // {
  //   seconds: -1,
  //   frame: 0,
  //   timecode: '01:00:00;00',
  //   mediaTime: '00:00:00.000',
  //   countdownMediaTime: '02:20:00.000',
  // },
  {
    seconds: 0,
    timecode: '01:00:00;00',
    mediaTime: '00:00:00.000',
    countdownMediaTime: '02:20:00.000',
  },
  {
    seconds: 0.5,
    frame: 25,
    percent: 0.005952,
    timecode: '01:00:00;25',
    mediaTime: '00:00:00.500',
    countdownMediaTime: '02:19:59.500',
  },
  {
    seconds: 30,
    percent: 0.357143,
    timecode: '01:00:29;53',
    mediaTime: '00:00:30.000',
  },
  {
    seconds: 765,
    frame: 45849,
    timecode: '01:12:44;53',
    countdownMediaTime: '02:07:15.000',
  },
  {
    seconds: 3300,
    percent: 39.285714,
    timecode: '01:54:59;53',
    countdownMediaTime: '01:25:00.000',
  },
  {
    seconds: 4260,
    frame: 255339,
    percent: 50.714286,
    timecode: '02:10:59;51',
    mediaTime: '01:11:00.000',
  },
  // {
  //   seconds: 9000,
  //   timecode: '03:19:59;55',
  //   mediaTime: '02:20:00.000',
  //   countdownMediaTime: '00:00:00.000',
  // },
];

function createConverter(frameRateModel: FrameRateModel, options: {initSegment?: boolean; ffom?: boolean} = {}): MediaTemporalConverter {
  let ffomTimecodeModel: TimecodeModel | undefined;

  if (options.ffom) {
    const ffomText = frameRateModel.dropFrames ? '01:00:00;00' : '01:00:00:00';
    const tcConverter = TimecodeConverter.create({frameRateModel});
    ffomTimecodeModel = tcConverter.parseValueTextToTimecodeModel(ffomText);
  }

  return MediaTemporalConverter.create({
    duration: DURATION,
    frameRateModel,
    initSegmentTimeOffset: options.initSegment ? INIT_SEGMENT : undefined,
    ffomTimecodeModel,
  });
}

function generateBidirectionalTests(name: string, testData: SecondsTestCase[], frameRateModel: FrameRateModel, options: {initSegment?: boolean; ffom?: boolean} = {}) {
  describe(name, () => {
    let converter: MediaTemporalConverter;

    beforeEach(() => {
      converter = createConverter(frameRateModel, options);
    });

    describe('SECONDS <=> FRAME_COUNT', () => {
      testData.forEach((tc) => {
        if (!tc.frame) {
          return;
        }

        it(`converts ${tc.seconds} seconds to frame ${tc.frame}`, () => {
          const result = converter.convert(tc.seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT);
          expect(result).toBe(tc.frame);
        });

        if (tc.seconds >= 0 && tc.seconds <= DURATION) {
          it(`converts frame ${tc.frame} to ${tc.seconds} seconds`, () => {
            const result = converter.convert(tc.frame!, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
            expect(result).toBeCloseTo(tc.seconds, 1);
          });
        }
      });
    });

    describe('SECONDS <=> PERCENT', () => {
      testData.forEach((tc) => {
        if (!tc.percent) {
          return;
        }

        it(`converts ${tc.seconds} seconds to ${tc.percent}%`, () => {
          const result = converter.convert(tc.seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.PERCENT);
          expect(result).toBeCloseTo(tc.percent!, 2);
        });

        if (tc.seconds >= 0 && tc.seconds <= DURATION) {
          it(`converts ${tc.percent}% to ${tc.seconds} seconds`, () => {
            const result = converter.convert(tc.percent!, MediaTemporalFormat.PERCENT, MediaTemporalFormat.SECONDS);
            expect(result).toBeCloseTo(tc.seconds, 1);
          });
        }
      });
    });

    describe('SECONDS <=> TIMECODE', () => {
      testData.forEach((tc) => {
        if (!tc.timecode) {
          return;
        }

        it(`converts ${tc.seconds} seconds to timecode ${tc.timecode}`, () => {
          const result = converter.convert(tc.seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
          expect(result).toBe(tc.timecode);
        });

        if (tc.seconds >= 0 && tc.seconds <= DURATION) {
          it(`converts timecode ${tc.timecode} to ${tc.seconds} seconds`, () => {
            const result = converter.convert(tc.timecode!, MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);
            expect(result).toBeCloseTo(tc.seconds, 1);
          });
        }
      });
    });

    describe('SECONDS <=> MEDIA_TIME', () => {
      testData.forEach((tc) => {
        if (!tc.mediaTime) {
          return;
        }

        it(`converts ${tc.seconds} seconds to media time ${tc.mediaTime}`, () => {
          const result = converter.convert(tc.seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.MEDIA_TIME);
          expect(result).toBe(tc.mediaTime);
        });

        if (tc.seconds >= 0 && tc.seconds <= DURATION) {
          it(`converts media time ${tc.mediaTime} to ${tc.seconds} seconds`, () => {
            const result = converter.convert(tc.mediaTime!, MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.SECONDS);
            expect(result).toBe(tc.seconds);
          });
        }
      });
    });

    describe('SECONDS <=> COUNTDOWN_MEDIA_TIME', () => {
      testData.forEach((tc) => {
        if (!tc.countdownMediaTime) {
          return;
        }

        it(`converts ${tc.seconds} seconds to countdown ${tc.countdownMediaTime}`, () => {
          const result = converter.convert(tc.seconds, MediaTemporalFormat.SECONDS, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
          expect(result).toBe(tc.countdownMediaTime);
        });

        if (tc.seconds >= 0 && tc.seconds <= DURATION) {
          it(`converts countdown ${tc.countdownMediaTime} to ${tc.seconds} seconds`, () => {
            const result = converter.convert(tc.countdownMediaTime!, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.SECONDS);
            expect(result).toBe(tc.seconds);
          });
        }
      });
    });
  });
}

describe('MediaTemporalConverter', () => {
  describe('FPS 23.976', () => {
    describe('SECONDS <=> OTHER FORMATS', () => {
      generateBidirectionalTests('No options', secondsTestData_23_976, FPS_23_976);
      generateBidirectionalTests('With FFOM', secondsTestData_23_976_ffom, FPS_23_976, {ffom: true});
    });

    describe('OTHER CONVERSIONS', () => {
      let converter: MediaTemporalConverter;
      let fpsModel = FPS_23_976;

      describe('No options', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel);
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 150000 frames to 74.48%`, () => {
            const result = converter.convert(150000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(74.48, 2);
          });

          it(`converts 4.965283% to 10000 frames`, () => {
            const result = converter.convert(4.965283, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(10000);
          });
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 10000 frames to 00:06:57.083`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:06:57.083');
          });

          it(`converts 00:34:45.419 to 50000 frames`, () => {
            const result = converter.convert('00:34:45.419', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 0.5% to 00:00:41:22`, () => {
            const result = converter.convert(0.5, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:00:41:22');
          });

          it(`converts 02:12:52:00 to 95%`, () => {
            const result = converter.convert('02:12:52:00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(95, 2);
          });
        });

        describe('PERCENT <=> COUNTDOWN_MEDIA_TIME', () => {
          it(`converts 10% to 02:06:00.000`, () => {
            const result = converter.convert(10, MediaTemporalFormat.PERCENT, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('02:06:00.000');
          });

          it(`converts 01:10:00.000 to 50%`, () => {
            const result = converter.convert('01:10:00.000', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(50, 1);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:00:00:23 to 00:00:00.959`, () => {
            const result = converter.convert('00:00:00:23', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:00.959');
          });

          it(`converts 01:12:04.449 to 01:12:00:03`, () => {
            const result = converter.convert('01:12:04.449', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:12:00:03');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 02:19:51:02`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:19:51:02');
          });

          it(`converts 01:32:35:00 to 00:47:19.445`, () => {
            const result = converter.convert('01:32:35:00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.445');
          });
        });
      });

      describe('With INIT SEG', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {initSegment: true});
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 100 frames to 00:00:04.250`, () => {
            const result = converter.convert(100, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:04.250');
          });

          it(`converts 01:44:16.337 to 150000 frames`, () => {
            const result = converter.convert('01:44:16.337', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(150000);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:09:58:10 to 00:09:59.095`, () => {
            const result = converter.convert('00:09:58:10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:59.095');
          });

          it(`converts 00:55:49.263 to 00:55:45:20`, () => {
            const result = converter.convert('00:55:49.263', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:55:45:20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 02:08:55:20`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:08:55:20');
          });

          it(`converts 00:42:13:09 to 01:37:44.011`, () => {
            const result = converter.convert('00:42:13:09', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:44.011');
          });
        });
      });

      describe('With FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {ffom: true});
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:09:58:10 to 00:09:59.015`, () => {
            const result = converter.convert('01:09:58:10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:59.015');
          });

          it(`converts 00:55:49.183 to 01:55:45:20`, () => {
            const result = converter.convert('00:55:49.183', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:55:45:20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 03:08:55:22`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:08:55:22');
          });

          it(`converts 01:42:13:11 to 01:37:44.008`, () => {
            const result = converter.convert('01:42:13:11', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:44.008');
          });
        });
      });

      describe('With INIT SEG + FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {
            initSegment: true,
            ffom: true,
          });
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 10000 frames to 4.97%`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(4.97, 2);
          });

          it(`converts 24.827366% to 50000 frames`, () => {
            const result = converter.convert(24.827366, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 10% to 01:13:59:01`, () => {
            const result = converter.convert(10, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:13:59:01');
          });

          it(`converts 02:09:55:17 to 50%`, () => {
            const result = converter.convert('02:09:55:17', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(50, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:00:00:23 to 00:00:01.039`, () => {
            const result = converter.convert('01:00:00:23', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:01.039');
          });

          it(`converts 01:12:04.529 to 02:12:00:03`, () => {
            const result = converter.convert('01:12:04.529', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:12:00:03');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 03:19:51:00`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:19:51:00');
          });

          it(`converts 02:32:34:23 to 00:47:19.406`, () => {
            const result = converter.convert('02:32:34:23', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.406');
          });
        });
      });
    });
  });

  describe('FPS 25', () => {
    describe('SECONDS <=> OTHER FORMATS', () => {
      generateBidirectionalTests('No options', secondsTestData_25, FPS_25);
    });

    describe('OTHER CONVERSIONS', () => {
      let converter: MediaTemporalConverter;
      let fpsModel = FPS_25;

      describe('No options', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel);
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 150000 frames to 71.43%`, () => {
            const result = converter.convert(150000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(71.43, 2);
          });

          it(`converts 4.761905% to 10000 frames`, () => {
            const result = converter.convert(4.761905, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(10000);
          });
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 10000 frames to 00:06:40.000`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:06:40.000');
          });

          it(`converts 00:33:20.000 to 50000 frames`, () => {
            const result = converter.convert('00:33:20.000', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 0.5% to 00:00:42:00`, () => {
            const result = converter.convert(0.5, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:00:42:00');
          });

          it(`converts 02:13:00:00 to 95%`, () => {
            const result = converter.convert('02:13:00:00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(95, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:00:00:24 to 00:00:00.960`, () => {
            const result = converter.convert('00:00:00:24', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:00.960');
          });

          it(`converts 01:12:00.120 to 01:12:00:03`, () => {
            const result = converter.convert('01:12:00.120', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:12:00:03');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 02:19:59:12`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:19:59:12');
          });

          it(`converts 01:32:40:13 to 00:47:19.479`, () => {
            const result = converter.convert('01:32:40:13', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.479');
          });
        });
      });

      describe('With INIT SEG', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {initSegment: true});
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 100 frames to 00:00:04.080`, () => {
            const result = converter.convert(100, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:04.080');
          });

          it(`converts 01:40:00.080 to 150000 frames`, () => {
            const result = converter.convert('01:40:00.080', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(150000);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:09:58:10 to 00:09:58.480`, () => {
            const result = converter.convert('00:09:58:10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:58.480');
          });

          it(`converts 00:55:45.880 to 00:55:45:20`, () => {
            const result = converter.convert('00:55:45.880', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:55:45:20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 02:09:03:14`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:09:03:14');
          });

          it(`converts 00:42:15:23 to 01:37:44.000`, () => {
            const result = converter.convert('00:42:15:23', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:44.000');
          });
        });
      });

      describe('With FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {ffom: true});
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:09:58:10 to 00:09:58.400`, () => {
            const result = converter.convert('01:09:58:10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:58.400');
          });

          it(`converts 00:55:45.800 to 01:55:45:20`, () => {
            const result = converter.convert('00:55:45.800', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:55:45:20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 03:09:03:16`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:09:03:16');
          });

          it(`converts 01:42:16:00 to 01:37:44.000`, () => {
            const result = converter.convert('01:42:16:00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:44.000');
          });
        });
      });

      describe('With INIT SEG + FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {
            initSegment: true,
            ffom: true,
          });
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 10000 frames to 4.76%`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(4.76, 2);
          });

          it(`converts 23.810476% to 49999 frames`, () => {
            const result = converter.convert(23.810476, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(49999);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 10% to 01:13:59:23`, () => {
            const result = converter.convert(10, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:13:59:23');
          });

          it(`converts 02:09:59:23 to 50%`, () => {
            const result = converter.convert('02:09:59:23', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(50, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:00:00:24 to 00:00:01.040`, () => {
            const result = converter.convert('01:00:00:24', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:01.040');
          });

          it(`converts 01:12:00.200 to 02:12:00:03`, () => {
            const result = converter.convert('01:12:00.200', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:12:00:03');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 03:19:59:10`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:19:59:10');
          });

          it(`converts 02:32:40:11 to 00:47:19.480`, () => {
            const result = converter.convert('02:32:40:11', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.480');
          });
        });
      });
    });
  });

  describe('FPS 29.97 DF', () => {
    describe('SECONDS <=> OTHER FORMATS', () => {
      generateBidirectionalTests('No options', secondsTestData_29_97_DF, FPS_29_97_DF);
      generateBidirectionalTests('With INIT SEG', secondsTestData_29_97_DF_initSeg, FPS_29_97_DF, {initSegment: true});
      generateBidirectionalTests('With FFOM', secondsTestData_29_97_DF_ffom, FPS_29_97_DF, {ffom: true});
      generateBidirectionalTests('With INIT SEG + FFOM', secondsTestData_29_97_DF_initSeg_ffom, FPS_29_97_DF, {
        initSegment: true,
        ffom: true,
      });
    });

    describe('OTHER CONVERSIONS', () => {
      let converter: MediaTemporalConverter;
      let fpsModel = FPS_29_97_DF;

      describe('No options', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel);
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 150000 frames to 59.58%`, () => {
            const result = converter.convert(150000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(59.58, 2);
          });

          it(`converts 3.972226% to 10000 frames`, () => {
            const result = converter.convert(3.972226, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(10000);
          });
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 10000 frames to 00:05:33.666`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:05:33.666');
          });

          it(`converts 00:27:48.335 to 50000 frames`, () => {
            const result = converter.convert('00:27:48.335', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 0.5% to 00:00:41;28`, () => {
            const result = converter.convert(0.5, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:00:41;28');
          });

          it(`converts 02:12:59;28 to 95%`, () => {
            const result = converter.convert('02:12:59;28', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(95, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:00:00;29 to 00:00:00.967`, () => {
            const result = converter.convert('00:00:00;29', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:00.967');
          });

          it(`converts 01:12:00.087 to 01:12:00;03`, () => {
            const result = converter.convert('01:12:00.087', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:12:00;03');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 02:19:59;15`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:19:59;15');
          });

          it(`converts 01:32:40;15 to 00:47:19.478`, () => {
            const result = converter.convert('01:32:40;15', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.478');
          });
        });
      });

      describe('With INIT SEG', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {initSegment: true});
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 100 frames to 00:00:03.416`, () => {
            const result = converter.convert(100, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:03.416');
          });

          it(`converts 01:23:25.085 to 150000 frames`, () => {
            const result = converter.convert('01:23:25.085', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(150000);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:09:58;10 to 00:09:58.411`, () => {
            const result = converter.convert('00:09:58;10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:58.411');
          });

          it(`converts 00:55:45.759 to 00:55:45;20`, () => {
            const result = converter.convert('00:55:45.759', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:55:45;20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 02:09:03;19`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:09:03;19');
          });

          it(`converts 00:42:15;27 to 01:37:44.019`, () => {
            const result = converter.convert('00:42:15;27', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:44.019');
          });
        });
      });

      describe('With FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {ffom: true});
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:09:58;10 to 00:09:58.331`, () => {
            const result = converter.convert('01:09:58;10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:58.331');
          });

          it(`converts 00:55:45.679 to 01:55:45;20`, () => {
            const result = converter.convert('00:55:45.679', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:55:45;20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 03:09:03;22`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:09:03;22');
          });

          it(`converts 01:42:16;00 to 01:37:43.999`, () => {
            const result = converter.convert('01:42:16;00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:43.999');
          });
        });
      });

      describe('With INIT SEG + FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {
            initSegment: true,
            ffom: true,
          });
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 10000 frames to 3.97%`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(3.97, 2);
          });

          it(`converts 19.862083% to 50000 frames`, () => {
            const result = converter.convert(19.862083, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 10% to 01:13:59;26`, () => {
            const result = converter.convert(10, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:13:59;26');
          });

          it(`converts 02:09:59;27 to 50%`, () => {
            const result = converter.convert('02:09:59;27', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(50, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:00:00;29 to 00:00:01.047`, () => {
            const result = converter.convert('01:00:00;29', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:01.047');
          });

          it(`converts 01:12:00.167 to 02:12:00;03`, () => {
            const result = converter.convert('01:12:00.167', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:12:00;03');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 03:19:59;12`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:19:59;12');
          });

          it(`converts 02:32:40;13 to 00:47:19.465`, () => {
            const result = converter.convert('02:32:40;13', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.465');
          });
        });
      });
    });
  });

  describe('FPS 59.94 DF', () => {
    describe('SECONDS <=> OTHER FORMATS', () => {
      generateBidirectionalTests('No options', secondsTestData_59_94_DF, FPS_59_94_DF);
      generateBidirectionalTests('With INIT SEG + FFOM', secondsTestData_59_94_DF_initSeg_ffom, FPS_59_94_DF, {
        initSegment: true,
        ffom: true,
      });
    });

    describe('OTHER CONVERSIONS', () => {
      let converter: MediaTemporalConverter;
      let fpsModel = FPS_59_94_DF;

      describe('No options', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel);
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 150000 frames to 29.79%`, () => {
            const result = converter.convert(150000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(29.79, 2);
          });

          it(`converts 1.986113% to 10000 frames`, () => {
            const result = converter.convert(1.986113, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(10000);
          });
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 10000 frames to 00:02:46.833`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:02:46.833');
          });

          it(`converts 00:13:54.168 to 50000 frames`, () => {
            const result = converter.convert('00:13:54.168', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 0.5% to 00:00:41;57`, () => {
            const result = converter.convert(0.5, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:00:41;57');
          });

          it(`converts 02:12:59;57 to 95%`, () => {
            const result = converter.convert('02:12:59;57', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(95, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:00:00;59 to 00:00:00.984`, () => {
            const result = converter.convert('00:00:00;59', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:00.984');
          });

          it(`converts 01:12:00.037 to 01:11:59;59`, () => {
            const result = converter.convert('01:12:00.037', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:11:59;59');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 02:19:59;30`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:19:59;30');
          });

          it(`converts 01:32:40;31 to 00:47:19.461`, () => {
            const result = converter.convert('01:32:40;31', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.461');
          });
        });
      });

      describe('With INIT SEG', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {initSegment: true});
        });

        describe('FRAME_COUNT <=> MEDIA_TIME', () => {
          it(`converts 100 frames to 00:00:01.748`, () => {
            const result = converter.convert(100, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:01.748');
          });

          it(`converts 00:41:42.583 to 150000 frames`, () => {
            const result = converter.convert('00:41:42.583', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(150000);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 00:09:58;10 to 00:09:58.244`, () => {
            const result = converter.convert('00:09:58;10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:58.244');
          });

          it(`converts 00:55:45.425 to 00:55:45;20`, () => {
            const result = converter.convert('00:55:45.425', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('00:55:45;20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 02:09:03;39`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:09:03;39');
          });

          it(`converts 00:42:15;55 to 01:37:44.003`, () => {
            const result = converter.convert('00:42:15;55', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:44.003');
          });
        });
      });

      describe('With FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {ffom: true});
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:09:58;10 to 00:09:58.164`, () => {
            const result = converter.convert('01:09:58;10', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:09:58.164');
          });

          it(`converts 00:55:45.345 to 01:55:45;20`, () => {
            const result = converter.convert('00:55:45.345', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:55:45;20');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:10:56.330 to 03:09:03;44`, () => {
            const result = converter.convert('00:10:56.330', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:09:03;44');
          });

          it(`converts 01:42:16;00 to 01:37:43.999`, () => {
            const result = converter.convert('01:42:16;00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('01:37:43.999');
          });
        });
      });

      describe('With INIT SEG + FFOM', () => {
        beforeEach(() => {
          converter = createConverter(fpsModel, {
            initSegment: true,
            ffom: true,
          });
        });

        describe('FRAME_COUNT <=> PERCENT', () => {
          it(`converts 10000 frames to 1.99%`, () => {
            const result = converter.convert(10000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(1.99, 2);
          });

          it(`converts 9.931518% to 50000 frames`, () => {
            const result = converter.convert(9.931518, MediaTemporalFormat.PERCENT, MediaTemporalFormat.FRAME_COUNT);
            expect(result).toBe(50000);
          });
        });

        describe('PERCENT <=> TIMECODE', () => {
          it(`converts 10% to 01:13:59;52`, () => {
            const result = converter.convert(10, MediaTemporalFormat.PERCENT, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('01:13:59;52');
          });

          it(`converts 02:09:59;55 to 50%`, () => {
            const result = converter.convert('02:09:59;55', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.PERCENT);
            expect(result).toBeCloseTo(50, 2);
          });
        });

        describe('TIMECODE <=> MEDIA_TIME', () => {
          it(`converts 01:00:00;59 to 00:00:01.064`, () => {
            const result = converter.convert('01:00:00;59', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME);
            expect(result).toBe('00:00:01.064');
          });

          it(`converts 01:12:00.117 to 02:11:59;59`, () => {
            const result = converter.convert('01:12:00.117', MediaTemporalFormat.MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('02:11:59;59');
          });
        });

        describe('COUNTDOWN_MEDIA_TIME <=> TIMECODE', () => {
          it(`converts 00:00:00.500 to 03:19:59;25`, () => {
            const result = converter.convert('00:00:00.500', MediaTemporalFormat.COUNTDOWN_MEDIA_TIME, MediaTemporalFormat.TIMECODE);
            expect(result).toBe('03:19:59;25');
          });

          it(`converts 02:32:40;26 to 00:47:19.465`, () => {
            const result = converter.convert('02:32:40;26', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME);
            expect(result).toBe('00:47:19.465');
          });
        });
      });
    });
  });

  describe('Edge cases', () => {
    it('throws error for unknown duration when converting seconds to percent', () => {
      const converter = MediaTemporalConverter.create({frameRateModel: FPS_25});
      expect(() => converter.convert(1000, MediaTemporalFormat.SECONDS, MediaTemporalFormat.PERCENT)).toThrow();
    });

    it('throws error for unknown duration when converting seconds to countdown media time', () => {
      const converter = MediaTemporalConverter.create({frameRateModel: FPS_25});
      expect(() => converter.convert(1000, MediaTemporalFormat.SECONDS, MediaTemporalFormat.COUNTDOWN_MEDIA_TIME)).toThrow();
    });

    it('does not throw an error for unknown duration and frame rate model when converting seconds to media time', () => {
      const converter = MediaTemporalConverter.create();
      expect(() => converter.convert(1000, MediaTemporalFormat.SECONDS, MediaTemporalFormat.MEDIA_TIME)).not.toThrow();
    });

    it('does not throw an error for unknown duration when converting frames to media time', () => {
      const converter = MediaTemporalConverter.create({frameRateModel: FPS_25});
      expect(() => converter.convert(1000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME)).not.toThrow();
    });

    it('does not throw an error for unknown duration when converting timecode to media time', () => {
      const converter = MediaTemporalConverter.create({frameRateModel: FPS_29_97_DF});
      expect(() => converter.convert('00:00:15;11', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.MEDIA_TIME)).not.toThrow();
    });

    it('throws error for unknown frame rate when converting seconds to frame', () => {
      const converter = MediaTemporalConverter.create({duration: DURATION});
      expect(() => converter.convert(1000, MediaTemporalFormat.SECONDS, MediaTemporalFormat.FRAME_COUNT)).toThrow();
    });

    it('throws error for unknown frame rate when converting seconds to timecode', () => {
      const converter = MediaTemporalConverter.create({duration: DURATION});
      expect(() => converter.convert(1000, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE)).toThrow();
    });

    it('throws error when using NDF notation with DF frame rate timecode', () => {
      const converter = createConverter(FPS_59_94_DF);
      expect(() => converter.convert('00:15:25:00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS)).toThrow();
    });

    it('throws error when using DF notation with NDF frame rate timecode', () => {
      const converter = createConverter(FPS_25);
      expect(() => converter.convert('00:15:25;00', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS)).toThrow();
    });

    it('converts 100 seconds to 100 seconds', () => {
      const converter = createConverter(FPS_23_976);
      const result = converter.convert(100, MediaTemporalFormat.SECONDS, MediaTemporalFormat.SECONDS);
      expect(result).toBe(100);
    });

    // it('converts -1 seconds to 0 seconds', () => {
    //   const converter = createConverter(FPS_25);
    //   const result = converter.convert(-1, MediaTemporalFormat.SECONDS, MediaTemporalFormat.SECONDS);
    //   expect(result).toBe(0);
    // });

    // it('converts 9000 seconds to 8400 seconds', () => {
    //   const converter = createConverter(FPS_59_94_DF);
    //   const result = converter.convert(9000, MediaTemporalFormat.SECONDS, MediaTemporalFormat.SECONDS);
    //   expect(result).toBe(8400);
    // });

    it('converts 100 frames to 100 frames', () => {
      const converter = createConverter(FPS_29_97_DF);
      const result = converter.convert(100, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.FRAME_COUNT);
      expect(result).toBe(100);
    });

    // it('converts -1 frames to 0 frames', () => {
    //   const converter = createConverter(FPS_23_976);
    //   const result = converter.convert(-1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.FRAME_COUNT);
    //   expect(result).toBe(0);
    // });

    // it('converts 300000 frames to 210000 frames', () => {
    //   const converter = createConverter(FPS_25);
    //   const result = converter.convert(300000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.FRAME_COUNT);
    //   expect(result).toBe(210000);
    // });

    it('converts 5403,954 seconds to 01:30:03:23 timecode', () => {
      const converter = createConverter(FPS_25);
      const result = converter.convert(5403.954, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('01:30:03:23');
    });

    it('converts 3289,427 seconds to 01:54:49;19 timecode', () => {
      const converter = createConverter(FPS_59_94_DF, {initSegment: true, ffom: true});
      const result = converter.convert(3289.427, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('01:54:49;19');
    });

    it('converts 863,194 seconds to 00:14:22:06 timecode', () => {
      const converter = createConverter(FPS_23_976, {initSegment: true});
      const result = converter.convert(863.194, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('00:14:22:06');
    });

    it('converts 03:05:27;55 timecode to 7527.983 seconds', () => {
      const converter = createConverter(FPS_59_94_DF, {initSegment: true, ffom: true});
      const result = converter.convert('03:05:27;55', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);
      expect(result).toBeCloseTo(7527.983, 2);
    });

    it('converts 00:56:41:17 timecode to 3405.190 seconds', () => {
      const converter = createConverter(FPS_23_976, {initSegment: true});
      const result = converter.convert('00:56:41:17', MediaTemporalFormat.TIMECODE, MediaTemporalFormat.SECONDS);
      expect(result).toBeCloseTo(3405.190, 2);
    });

    it('converts 1 frame to 00:00:00:01 timecode (fps=23.976)', () => {
      const converter = createConverter(FPS_23_976);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('00:00:00:01');
    });

    it('converts 1 frame to 00:00:00.041 media time (fps=23.976)', () => {
      const converter = createConverter(FPS_23_976);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
      expect(result).toBe('00:00:00.041');
    });

    it('converts 1 frame to 00:00:00:01 timecode (fps=25)', () => {
      const converter = createConverter(FPS_25);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('00:00:00:01');
    });

    it('converts 1 frame to 00:00:00.040 media time (fps=25)', () => {
      const converter = createConverter(FPS_25);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
      expect(result).toBe('00:00:00.040');
    });

    it('converts 1 frame to 00:00:00;01 timecode (fps=29.97 DF)', () => {
      const converter = createConverter(FPS_29_97_DF);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('00:00:00;01');
    });

    it('converts 1 frame to 00:00:00.033 media time (fps=29.97 DF)', () => {
      const converter = createConverter(FPS_29_97_DF);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
      expect(result).toBe('00:00:00.033');
    });

    it('converts 1 frame to 00:00:00;01 timecode (fps=59.94 DF)', () => {
      const converter = createConverter(FPS_59_94_DF);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('00:00:00;01');
    });

    it('converts 1 frame to 00:00:00.016 media time (fps=59.94 DF)', () => {
      const converter = createConverter(FPS_59_94_DF);
      const result = converter.convert(1, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.MEDIA_TIME);
      expect(result).toBe('00:00:00.016');
    });

    // it('converts 1000000 frames to 8400 seconds (fps=23.976)', () => {
    //   const converter = createConverter(FPS_23_976);
    //   const result = converter.convert(1000000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    //   expect(result).toBeCloseTo(DURATION, 1);
    // });

    // it('converts 1000000 frames to 8400 seconds (fps=25)', () => {
    //   const converter = createConverter(FPS_25);
    //   const result = converter.convert(1000000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    //   expect(result).toBeCloseTo(DURATION, 1);
    // });

    // it('converts 1000000 frames to 8400 seconds (fps=29.97 DF)', () => {
    //   const converter = createConverter(FPS_29_97_DF);
    //   const result = converter.convert(1000000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    //   expect(result).toBeCloseTo(DURATION, 1);
    // });

    // it('converts 1000000 frames to 8400 seconds (fps=59.94 DF)', () => {
    //   const converter = createConverter(FPS_59_94_DF);
    //   const result = converter.convert(1000000, MediaTemporalFormat.FRAME_COUNT, MediaTemporalFormat.SECONDS);
    //   expect(result).toBeCloseTo(DURATION, 1);
    // });

    it('converts 450 seconds to 00:07:29:14 timecode (fps=29.97 NDF)', () => {
      const converter = createConverter(FPS_29_97_NDF, {initSegment: true});
      const result = converter.convert(450, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      expect(result).toBe('00:07:29:14');
    });
  });
});
