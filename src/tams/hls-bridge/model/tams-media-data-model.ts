import type {Flow, FlowSegment} from '../../tams-model';

export type TamsMediaData = {
  flow: Flow;
  subflows?: Flow[];
  flowsSegments: Map<string, FlowSegment[]>;

  /**
   * What the segments loaded here span, in TAMS timerange notation, as the load left it.
   *
   * These are the flows as fetched, so the range describes that fetch and does not move afterwards.
   * The window as it stands is on the media's `TamsMediaMetadata`.
   */
  timerange?: string | undefined;
};
