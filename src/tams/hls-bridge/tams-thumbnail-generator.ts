import type {Flow, ImageFlow, FlowSegment} from '../tams-model';
import {TimeRangeUtil} from '../time-range-util';
import {BlobUtil} from '../../util/blob-util';
import {TAMS_CONTAINER, TAMS_MANIFEST} from '../constants';

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

  public static generateThumbnailVtt(segments: FlowSegment[], videoEnd: number, timeOffset: number): string {
    let vttLines: string[] = ['WEBVTT', ''];

    segments.forEach((segment, index) => {
      const getUrls = segment.get_urls || [];

      if (getUrls.length === 0) return;

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

      const startTime = this.toTimestamp(start - timeOffset);
      const endTime = this.toTimestamp(end - timeOffset);

      vttLines.push(`${startTime} --> ${endTime}`);
      vttLines.push(segment.get_urls!.at(-1)!.url!);
      vttLines.push('');
    });

    return vttLines.join('\n');
  }

  public static generateThumbnailVttBlob(segments: FlowSegment[], videoEnd: number, timeOffset: number) {
    const vttFile = this.generateThumbnailVtt(segments, videoEnd, timeOffset);

    // tracked by BlobUtil, so it is released along with the player's other blobs on destroy
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
