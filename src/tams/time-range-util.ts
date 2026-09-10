export type TimeMoment = [number, number]; //  [seconds, nanoseconds]

export interface TimeRange {
  start?: TimeMoment | undefined; // [seconds, nanoseconds]
  end?: TimeMoment | undefined; // [seconds, nanoseconds]
  isStartInclusive: boolean;
  isEndInclusive: boolean;
  /**
   * `()` — "never": a range of zero length in no particular position. Distinct from eternity (`_`),
   * which is also unbounded on both sides but covers the entire timeline.
   */
  isNever?: boolean | undefined;
}

import {TAMS_TIME_MOMENT_EXPR} from './constants';

/**
 * TAMS timerange expressions: one or two timestamps with inclusivity markers, where `[` / `]` are
 * inclusive and `(` / `)` are exclusive.
 *
 * - `[0:0_10:0)` — 10 seconds of media starting at `0:0` and ending before `10:0`
 * - `(5:0_` — starts after `5:0` and runs to eternity
 * - `_` — eternity, the entire timeline
 * - `()` — never, zero length in no particular position
 * - `[1694429247:0]` — instantaneous, equivalent to `[1694429247:0_1694429247:0]`
 *
 * Omitted markers default to an inclusive start and an exclusive end. Instantaneous ranges cannot
 * use exclusive markers.
 */
export class TimeRangeUtil {
  private static timeRangePattern = new RegExp(String.raw`^(\[|\()?(${TAMS_TIME_MOMENT_EXPR})?(_(${TAMS_TIME_MOMENT_EXPR})?)?(\]|\))?$`);
  private static timeMomentPattern = new RegExp(`^${TAMS_TIME_MOMENT_EXPR}$`);

  static parseTimeMoment(timeMomentText: string): TimeMoment {
    if (!this.timeMomentPattern.test(timeMomentText)) {
      throw new Error('Not valid timestamp: ' + timeMomentText);
    }
    const [seconds, nanoseconds] = timeMomentText.split(':').map(Number);
    return [seconds ?? 0, nanoseconds ?? 0];
  }

  static parseTimeRange(timeRangeStr: string): TimeRange {
    const match = timeRangeStr.match(this.timeRangePattern);
    if (!match) {
      throw new Error('Not valid timerange: ' + timeRangeStr);
    }

    const openMarker = match[1];
    const closeMarker = match[5];
    const startText = match[2];
    const endText = match[4];
    // the `_` separator is what distinguishes a range from a single timestamp
    const hasSeparator = match[3] !== undefined;

    // Parse inclusivity markers; an omitted marker means an inclusive start and an exclusive end
    const isStartInclusive = openMarker ? openMarker === '[' : true;
    const isEndInclusive = closeMarker ? closeMarker === ']' : false;

    if (!hasSeparator) {
      if (startText) {
        // single timestamp - an instantaneous range, which is inclusive on both bounds
        if (openMarker === '(' || closeMarker === ')') {
          throw new Error('Instantaneous timerange cannot use exclusive markers: ' + timeRangeStr);
        }
        const timeMoment = this.parseTimeMoment(startText);
        return {
          start: timeMoment,
          end: timeMoment,
          isStartInclusive: true,
          isEndInclusive: true,
        };
      }

      if (!openMarker && !closeMarker) {
        // neither timestamps, markers nor separator
        throw new Error('Not valid timerange: ' + timeRangeStr);
      }

      // markers without timestamps or separator - "never"
      return {
        start: undefined,
        end: undefined,
        isStartInclusive: isStartInclusive,
        isEndInclusive: isEndInclusive,
        isNever: true,
      };
    }

    // Timestamps are optional; a missing bound is unbounded (eternity in that direction)
    return {
      start: startText ? this.parseTimeMoment(startText) : undefined,
      end: endText ? this.parseTimeMoment(endText) : undefined,
      isStartInclusive: isStartInclusive,
      isEndInclusive: isEndInclusive,
    };
  }

  /** `()` — matches nothing. */
  static isNever(timeRange: TimeRange): boolean {
    return !!timeRange.isNever;
  }

  /** `_` — the entire timeline. */
  static isEternity(timeRange: TimeRange): boolean {
    return !timeRange.isNever && timeRange.start === undefined && timeRange.end === undefined;
  }

  /** Zero length at a position, ie. `[1694429247:0]`. */
  static isInstantaneous(timeRange: TimeRange): boolean {
    const {start, end} = timeRange;
    return !timeRange.isNever && !!start && !!end && this.timeMomentToMilliseconds(start) === this.timeMomentToMilliseconds(end);
  }

  /** Whether the range runs to eternity, ie. has no end bound. */
  static isEndUnbounded(timeRange: TimeRange): boolean {
    return !timeRange.isNever && timeRange.end === undefined;
  }

  static timeMomentToSeconds(timeMoment: TimeMoment): number {
    return TimeRangeUtil.timeMomentToMilliseconds(timeMoment) / 1000;
  }

  static timeMomentToMilliseconds(timeMoment: TimeMoment): number {
    const milliseconds = timeMoment[0] * 1000;
    return milliseconds + timeMoment[1] / 1_000_000;
  }

  static timeMomentToDate(timeMoment: TimeMoment): Date {
    const milliseconds = timeMoment[0] * 1000;
    // Convert nanoseconds to milliseconds and add to total milliseconds
    const adjustedMilliseconds = milliseconds + timeMoment[1] / 1_000_000;
    return new Date(adjustedMilliseconds);
  }

  static nanosecondsToSeconds(nanoseconds: number): number {
    return nanoseconds / 1_000_000_000;
  }

  static nanosecondsToTimeMoment(nanoseconds: number): TimeMoment {
    const seconds = Math.floor(nanoseconds / 1_000_000_000);
    const restNanoseconds = Math.ceil(nanoseconds % 1_000_000_000);
    return [seconds, restNanoseconds];
  }

  static secondsToTimeMoment(seconds: number): TimeMoment {
    return this.nanosecondsToTimeMoment(seconds * 1_000_000_000);
  }

  static timerangeExprDuration(timerange: string): number {
    return this.timeRangeDuration(this.parseTimeRange(timerange));
  }

  /** `0` for never and instantaneous ranges, `Infinity` for anything unbounded. */
  static timeRangeDuration(timeRange: TimeRange): number {
    if (timeRange.isNever) {
      return 0;
    }

    const {start, end} = timeRange;

    if (start === void 0 || end === void 0) {
      // eternity, or unbounded in one direction
      return Infinity;
    } else {
      // Calculate difference in seconds
      const secondsDiff = end[0] - start[0];
      const nanosecondsDiff = end[1] - start[1];
      const totalSeconds = secondsDiff + nanosecondsDiff / 1e9;

      // Round to three decimal places
      return parseFloat(totalSeconds.toFixed(3));
    }
  }

  static formatTimeMomentExpr(timeMoment: TimeMoment): string {
    return `${timeMoment[0]}:${timeMoment[1]}`;
  }

  static formatNanosecondsToTimeMomentExpr(nanoseconds: number): string {
    return this.formatTimeMomentExpr(this.nanosecondsToTimeMoment(nanoseconds));
  }

  static toTimeRange(start?: TimeMoment, end?: TimeMoment, isStartInclusive = true, isEndInclusive = true): TimeRange {
    return {
      start: start,
      end: end,
      isStartInclusive: isStartInclusive,
      isEndInclusive: isEndInclusive,
    };
  }

  static formatTimeRangeExpr(timeRange: TimeRange): string {
    if (timeRange.isNever) {
      return '()';
    }

    const {start, end} = timeRange;

    if (start === undefined && end === undefined) {
      return '_';
    }

    if (this.isInstantaneous(timeRange) && timeRange.isStartInclusive && timeRange.isEndInclusive) {
      return `[${this.formatTimeMomentExpr(start!)}]`;
    }

    const startExpr = start ? `${timeRange.isStartInclusive ? '[' : '('}${this.formatTimeMomentExpr(start)}` : '';
    const endExpr = end ? `${this.formatTimeMomentExpr(end)}${timeRange.isEndInclusive ? ']' : ')'}` : '';

    return `${startExpr}_${endExpr}`;
  }
}
