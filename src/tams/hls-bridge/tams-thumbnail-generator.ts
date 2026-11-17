import type {Flow, ImageFlow, FlowSegment} from '../tams-model';
import {TimeRangeUtil} from '../time-range-util';
import {BlobUtil} from '../../util/blob/blob-util';
import {TAMS_CONTAINER, TAMS_MANIFEST} from '../constants';

export interface TamsThumbnailCue {
  start: number;
  end: number;
  url: string;
}

export class TamsThumbnailGenerator {
  public static resolveLowestQualityImageFlow(flows: Flow[]) {
    const imageFlows = flows.filter((flow) => flow.format === 'urn:x-tam:format:image') as ImageFlow[];

    if (imageFlows.length === 0) {
      return undefined;
    }

    const lowestQualityImageFlow = imageFlows.reduce<ImageFlow | undefined>((lowestQualityFlow: undefined | ImageFlow, currentFlow: ImageFlow) => {
      if (lowestQualityFlow === undefined) {
        return currentFlow;
      }

      const lowestQualityFlowTotalPixels = lowestQualityFlow.essence_parameters.frame_width * lowestQualityFlow.essence_parameters.frame_height;
      const currentFlowTotalPixels = currentFlow.essence_parameters.frame_height * currentFlow.essence_parameters.frame_width;

      if (currentFlowTotalPixels < lowestQualityFlowTotalPixels) {
        return currentFlow;
      }

      return lowestQualityFlow;
    }, undefined);

    return lowestQualityImageFlow;
  }

  public static generateThumbnailCues(segments: FlowSegment[], videoEnd: number, timeOffset: number): TamsThumbnailCue[] {
    const cues: TamsThumbnailCue[] = [];

    segments.forEach((segment, index) => {
      const url = segment.get_urls?.at(-1)?.url;

      if (!url) return;

      const start = TimeRangeUtil.timeMomentToSeconds(TimeRangeUtil.parseTimeRange(segment.timerange).start!);
      let end;

      if (index === segments.length - 1) {
        end = videoEnd - TAMS_MANIFEST.gapToleranceSeconds;
      } else {
        end = TimeRangeUtil.timeMomentToSeconds(TimeRangeUtil.parseTimeRange(segments.at(index + 1)!.timerange).start!) - TAMS_MANIFEST.gapToleranceSeconds;
      }

      if (end <= start) {
        console.debug(`Malformed thumbnail vtt cue, skipped ${start} --> ${end}`);
        return;
      }

      cues.push({start: start - timeOffset, end: end - timeOffset, url: url});
    });

    return cues;
  }

  public static writeThumbnailVtt(cues: TamsThumbnailCue[]): string {
    let vttLines: string[] = ['WEBVTT', ''];

    cues.forEach((cue) => {
      vttLines.push(`${this.toTimestamp(cue.start)} --> ${this.toTimestamp(cue.end)}`);
      vttLines.push(cue.url);
      vttLines.push('');
    });

    return vttLines.join('\n');
  }

  public static generateThumbnailVtt(segments: FlowSegment[], videoEnd: number, timeOffset: number): string {
    return this.writeThumbnailVtt(this.generateThumbnailCues(segments, videoEnd, timeOffset));
  }

  public static generateThumbnailVttBlob(segments: FlowSegment[], videoEnd: number, timeOffset: number) {
    const vttFile = this.generateThumbnailVtt(segments, videoEnd, timeOffset);

    /**
     * Currently not tracked because it is not used anywhere.
     *
     * Should be tracked in a future via ({@link BlobManager._blobs} or {@link BlobManager._ownerBlobs})
     * if used anywhere in the player (e.g. {@link generateThumbnailTrackUrl}).
     */
    return BlobUtil.createBlobURL([vttFile], {type: TAMS_CONTAINER.vtt});
  }

  private static toTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds % 1) * 1000); // Extract milliseconds correctly

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  public static generateThumbnailTrackUrl(flows: Flow[], flowsSegments: Map<string, FlowSegment[]>, videoEnd: number, timeOffset: number) {
    const imageFlow = this.resolveLowestQualityImageFlow(flows);

    if (!imageFlow) {
      return undefined;
    }

    const segments = flowsSegments.get(imageFlow.id);
    if (!segments?.length) {
      // no thumbnails were fetched for the loaded range - a blob here would be an empty track
      return undefined;
    }

    return this.generateThumbnailVttBlob(segments, videoEnd, timeOffset);
  }
}
