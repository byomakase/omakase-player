import {Observable, map, switchMap, forkJoin, of, expand, EMPTY, last} from 'rxjs';
import {OmpError} from '../../types';
import type {Flow, FlowSegment, Source} from '../tams-model';
import {getTamsApi} from './tams-api';
import {TamsUtil} from '../tams-util';
import type {TamsMediaData} from './model/tams-media-data-model';
import {TAMS_FORMAT} from '../constants';

export class ManifestResourcesFetcher {
  private _tamsApi;
  constructor(endpoint: string, headers?: (url: string) => {headers: Record<string, string>}) {
    this._tamsApi = getTamsApi(endpoint, headers);
  }

  private fetchTamsResource(url: string): Observable<{flow?: Flow; source?: Source}> {
    return this._tamsApi.getUrl(url).pipe(map(({data}) => (data['source_id'] ? {flow: data as Flow} : {source: data as Source})));
  }

  public fetchManifestResources(url: string, durationOrTimeRange?: string | number | undefined): Observable<TamsMediaData & {timerange: string}> {
    return this.fetchTamsResource(url).pipe(
      switchMap((resource) => (resource.flow ? this._fetchFlow(resource.flow.id) : this._fetchFirstFlowBySourceId(resource.source!.id))),
      switchMap((flow) => {
        if (!flow) {
          throw new OmpError(`Source has no flow representations`);
        }

        return this.fetchFlowResources(flow, durationOrTimeRange);
      })
    );
  }

  public fetchFlowResources(flow: Flow, durationOrTimeRange?: string | number | undefined): Observable<TamsMediaData & {timerange: string}> {
    const isVirtualFlow = flow.id === TamsUtil.VIRTUAL_FLOW_ID;

    return this._fetchSubflows(flow.flow_collection?.map((collectionItem) => collectionItem.id) ?? []).pipe(
      switchMap((subflows) => {
        const maxTimerange = TamsUtil.resolveMaxTimerange(isVirtualFlow ? subflows : [flow, ...subflows]);

        if (maxTimerange === '()') {
          throw new OmpError('Provided TAMS media has no timerange');
        }

        let timerange: string;
        if (!durationOrTimeRange) {
          timerange = TamsUtil.convertDurationToTimerange(300, maxTimerange);
        } else if (typeof durationOrTimeRange === 'number') {
          timerange = TamsUtil.convertDurationToTimerange(durationOrTimeRange, maxTimerange);
        } else {
          // open bounds (ie. a start-only range) are filled in from the flow extent, so an
          // explicitly requested start is never widened to the whole flow
          timerange = TamsUtil.resolveTimerangeAgainstMax(durationOrTimeRange, maxTimerange);
        }

        const flows = [flow, ...subflows];

        return forkJoin(flows.map((flow) => this.fetchFlowSegments(flow.id, timerange).pipe(map((segments) => [flow.id, segments] as [string, FlowSegment[]])))).pipe(
          map((flowIdWithSegments) => {
            const flowsSegments = new Map<string, FlowSegment[]>(flowIdWithSegments ?? []);

            return {
              flow: flow,
              subflows: subflows,
              flowsSegments: flowsSegments,
              // what the store answered with, which need not be the whole of what was asked for
              timerange: TamsUtil.resolveSegmentsTimerange(flowsSegments, flows) ?? timerange,
            };
          })
        );
      })
    );
  }

  private _fetchSubflows(flowIds: string[]): Observable<Flow[]> {
    if (flowIds.length === 0) {
      return of([]);
    }

    return forkJoin(flowIds.map((flowId) => this._fetchFlow(flowId))).pipe(map((subflows) => subflows.filter((flow) => !this._isFlowHlsIncompatible(flow))));
  }

  private _fetchFlow(flowId: string): Observable<Flow> {
    return this._tamsApi.get(`/flows/${flowId}?include_timerange=true`).pipe(map(({data}) => data as Flow));
  }

  private _fetchFirstFlowBySourceId(sourceId: string): Observable<Flow | undefined> {
    return this._tamsApi.get(`/flows?source_id=${sourceId}`).pipe(
      switchMap(({data}) => {
        const firstFlow = (data as Flow[]).at(0);

        if (!firstFlow) {
          return of(undefined);
        }

        return this._fetchFlow(firstFlow.id);
      })
    );
  }

  /**
   * Fetches a flow's segments overlapping `timerange`, following `next` links. Live playback polls
   * this with an open-ended range starting at the last known segment end to pick up new segments.
   */
  public fetchFlowSegments(flowId: string, timerange?: string | undefined, maxResults?: number): Observable<FlowSegment[]> {
    if (flowId === TamsUtil.VIRTUAL_FLOW_ID) {
      return of([]);
    }

    const initialPath = `/flows/${flowId}/segments${timerange ? `?timerange=${timerange}` : ''}${timerange ? '&' : '?'}limit=300`;

    return this._tamsApi.get(initialPath).pipe(
      map((response) => ({records: response.data as FlowSegment[], nextLink: response.nextLink})),
      // follow pagination via `next` links, accumulating records, until exhausted or maxResults reached
      expand((page) =>
        page.nextLink && (!maxResults || page.records.length < maxResults)
          ? this._tamsApi.getUrl(page.nextLink).pipe(map((response) => ({records: page.records.concat(response.data as FlowSegment[]), nextLink: response.nextLink})))
          : EMPTY
      ),
      last(),
      map((page) => (maxResults ? page.records.slice(0, maxResults) : page.records))
    );
  }

  private _isFlowHlsIncompatible(flow: Flow) {
    return (!flow.tags?.hls_exclude || Array.isArray(flow.tags?.hls_exclude) ? '' : flow.tags?.hls_exclude).toLowerCase() === 'true';
  }

  public fetchManifestResourcesForMultipleFlows(urls: string[], durationOrTimeRange: string | number | undefined): Observable<TamsMediaData & {timerange: string}> {
    return forkJoin(urls.map((url) => this.fetchTamsResource(url))).pipe(
      switchMap((resources) => {
        const hasSource = resources.some((resource) => resource.source);

        if (hasSource) {
          throw new Error(`Source found in array of flows`);
        }

        const flows = resources.map((resource) => resource.flow!);

        const hasMultiFlow = flows.some((flow) => flow.format === TAMS_FORMAT.multi);

        if (hasMultiFlow) {
          throw new Error(`Multiflow found in array of flows`);
        }

        const hasMultipleVideoFlows = flows.filter((flow) => flow.format === TAMS_FORMAT.video).length > 1;

        if (hasMultipleVideoFlows) {
          throw new Error(`Multiple video flows found in array of flows`);
        }

        return this.fetchFlowResources(
          {
            id: TamsUtil.VIRTUAL_FLOW_ID,
            source_id: '',
            format: TAMS_FORMAT.multi,
            flow_collection: flows.map((flow) => ({
              id: flow.id,
              role: '',
            })),
          } as Flow,
          durationOrTimeRange
        );
      })
    );
  }
}
