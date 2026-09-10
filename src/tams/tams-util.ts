import {firstValueFrom, Observable, type Subscriber, type TeardownLogic} from 'rxjs';
import {fromPromise} from 'rxjs/internal/observable/innerFrom';
import {OmpError} from '../types';
import type {Flow, FlowSegment} from './tams-model';
import type {AuthenticationData} from '../common/authentication';
import {type TimeMoment, TimeRangeUtil} from './time-range-util';
import {TAMS_FLOW, TAMS_FORMAT, TAMS_TAG} from './constants';

export class TamsUtil {
  public static get VIRTUAL_FLOW_ID() {
    return 'omakase-tams-virtual-flow';
  }

  public static extractApiEndpointAndId(path: string): [string, string] | null {
    const match = path.match(/^(.+)\/(flows|sources)\/([^/]+)$/);
    return match ? [match[1]!, match[3]!] : null;
  }

  public static resolveMaxTimerange(flows: Flow[]) {
    const flowsWithTimerange = flows.filter((flow) => flow.timerange);
    const videoFlows = flowsWithTimerange.filter((flow) => flow.format === TAMS_FORMAT.video || flow.format === TAMS_FORMAT.multi);

    const validFlows = videoFlows.length ? videoFlows : flowsWithTimerange;

    if (!validFlows.length) {
      return '()';
    }

    const [start, end] = validFlows.reduce<[number | null, number | null]>(
      ([start, end], flow) => {
        const parsedTimerange = TimeRangeUtil.parseTimeRange(flow.timerange!);
        let newStart = parsedTimerange.start ? TimeRangeUtil.timeMomentToSeconds(parsedTimerange.start) : null;
        let newEnd = parsedTimerange.end ? TimeRangeUtil.timeMomentToSeconds(parsedTimerange.end) : null;
        if (start === null || (newStart !== null && newStart < start)) {
          start = newStart;
        }
        if (end === null || (newEnd !== null && newEnd > end)) {
          end = newEnd;
        }

        return [start, end];
      },
      [null, null]
    );

    if (start === null || end === null) {
      return '()';
    }

    return TimeRangeUtil.formatTimeRangeExpr({
      start: TimeRangeUtil.secondsToTimeMoment(start),
      end: TimeRangeUtil.secondsToTimeMoment(end),
      isStartInclusive: true,
      isEndInclusive: false,
    });
  }

  public static resolveSegmentsTimerange(flowsSegments: Map<string, FlowSegment[]>, flows: Flow[]): string | undefined {
    const segments = this.resolveStreamSegments(flowsSegments, flows);

    const start = segments ? TimeRangeUtil.parseTimeRange(segments[0]!.timerange).start : undefined;
    const end = segments ? TimeRangeUtil.parseTimeRange(segments[segments.length - 1]!.timerange).end : undefined;

    if (!start || !end) {
      return undefined;
    }

    return TimeRangeUtil.formatTimeRangeExpr({
      start: start,
      end: end,
      isStartInclusive: true,
      isEndInclusive: false,
    });
  }

  private static resolveStreamSegments(flowsSegments: Map<string, FlowSegment[]>, flows: Flow[]): FlowSegment[] | undefined {
    const flowsById = new Map<string, Flow>(flows.map((flow) => [flow.id, flow]));

    let videoSegments: FlowSegment[] | undefined;
    let muxedSegments: FlowSegment[] | undefined;
    let audioSegments: FlowSegment[] | undefined;

    for (const [flowId, segments] of flowsSegments) {
      const flow = segments.length > 0 ? flowsById.get(flowId) : undefined;
      if (!flow) {
        continue;
      }

      if (flow.format === TAMS_FORMAT.video) {
        videoSegments ??= segments;
      } else if (flow.format === TAMS_FORMAT.multi && flow.container) {
        // an unmuxed multi flow holds no essence of its own, only the subflows it gathers
        muxedSegments ??= segments;
      } else if (flow.format === TAMS_FORMAT.audio) {
        audioSegments ??= segments;
      }
    }

    return videoSegments ?? muxedSegments ?? audioSegments;
  }

  public static resolveTimerangeAgainstMax(timerange: string, maxTimerange: string): string {
    const requested = TimeRangeUtil.parseTimeRange(timerange);
    const max = TimeRangeUtil.parseTimeRange(maxTimerange);

    // "never" holds no media and the flow extent cannot widen it
    if (TimeRangeUtil.isNever(requested) || TimeRangeUtil.isNever(max)) {
      return TimeRangeUtil.formatTimeRangeExpr({...requested, isNever: true});
    }

    const hasRequestedStart = requested.start !== undefined;
    const start = requested.start ?? max.start;

    let end = requested.end ?? max.end;
    let isEndInclusive = requested.end ? requested.isEndInclusive : max.isEndInclusive;

    if (requested.end && max.end && TimeRangeUtil.timeMomentToSeconds(requested.end) > TimeRangeUtil.timeMomentToSeconds(max.end)) {
      end = max.end;
      isEndInclusive = max.isEndInclusive;
    }

    return TimeRangeUtil.formatTimeRangeExpr({
      start: start,
      end: end,
      isStartInclusive: hasRequestedStart ? requested.isStartInclusive : max.isStartInclusive,
      isEndInclusive: isEndInclusive,
    });
  }

  public static openEndedTimerangeFrom(timeMoment: TimeMoment): string {
    return TimeRangeUtil.formatTimeRangeExpr({
      start: timeMoment,
      end: undefined,
      isStartInclusive: true,
      isEndInclusive: false,
    });
  }

  public static convertDurationToTimerange(duration: number, timerange: string) {
    const parsedTimerange = TimeRangeUtil.parseTimeRange(timerange);

    if (parsedTimerange.start === undefined || parsedTimerange.end === undefined) {
      throw new OmpError(`Can't convert duration to timerange. Timerange is missing start and/or end.`);
    }

    const startSeconds = TimeRangeUtil.timeMomentToSeconds(parsedTimerange.start);
    const endSeconds = TimeRangeUtil.timeMomentToSeconds(parsedTimerange.end);

    if (endSeconds - startSeconds < duration) {
      console.warn(`Provided duration is longer than timerange, using total timerange`, timerange);
      return timerange;
    }
    const newStart = endSeconds - duration;

    return TimeRangeUtil.formatTimeRangeExpr({
      start: TimeRangeUtil.secondsToTimeMoment(newStart),
      end: parsedTimerange.end,
      isEndInclusive: parsedTimerange.isEndInclusive,
      isStartInclusive: parsedTimerange.isStartInclusive,
    });
  }

  public static getBlobUuid(url: string): string {
    const cleaned = url.endsWith('/') ? url.slice(0, -1) : url;
    return cleaned.substring(cleaned.lastIndexOf('/') + 1);
  }

  public static getHeadersFunction(auth: AuthenticationData): (url: string) => {headers: {[header: string]: string}} {
    switch (auth.type) {
      case 'basic': {
        const encoded = btoa(`${auth.username}:${auth.password}`);
        return () => ({headers: {Authorization: `Basic ${encoded}`}});
      }
      case 'bearer':
        return () => ({headers: {Authorization: `Bearer ${auth.token}`}});
      case 'custom':
        return auth.headers;
    }
  }

  public static passiveObservable<T = void>(subscribe: (this: Observable<T>, subscriber: Subscriber<T>) => TeardownLogic): Observable<T> {
    return fromPromise<T>(firstValueFrom<T>(new Observable<T>(subscribe))) as Observable<T>;
  }


  public static isFlowIngesting(flow: Flow): boolean {
    return flow.tags?.[TAMS_TAG.flow_status] === TAMS_TAG.flow_status_ingesting || flow.status === TAMS_FLOW.status_ingesting;
  }

  public static resolveStreamCarrierFlows(flows: Flow[]): Flow[] {
    const muxedFlowsWithSegments = flows.filter((flow) => flow.format === 'urn:x-nmos:format:multi' && !!flow.container);
    const videoFlows = flows.filter((flow) => flow.format === 'urn:x-nmos:format:video');
    const audioFlows = flows.filter((flow) => flow.format === 'urn:x-nmos:format:audio');

    if (muxedFlowsWithSegments.length) {
      return muxedFlowsWithSegments;
    } else if (videoFlows.length) {
      return videoFlows;
    } else if (audioFlows.length) {
      return audioFlows;
    }

    return [];
  }
}
