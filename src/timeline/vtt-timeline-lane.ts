import {map, mergeAll, Observable, sampleTime, takeUntil} from 'rxjs';
import {DownsampleConfig, VttAwareApi, VttLoadOptions} from '../api/vtt-aware-api';
import {OmakaseVttCue, OmakaseVttCueEvent, OmakaseVttFile, PlayheadMoveEvent, ScrubberMoveEvent, VideoTimeChangeEvent} from '../types';
import {BaseTimelineLane, TimelineLaneConfig, TimelineLaneStyle, VTT_DOWNSAMPLE_CONFIG_DEFAULT} from './timeline-lane';
import {VttAdapter} from '../common/vtt-adapter';
import {AuthUtil} from '../util/auth-util';
import {AxiosRequestConfig} from 'axios';

const sampleTimeSyncVideoMetadata = 100;

export interface VttTimelineLaneConfig<S extends TimelineLaneStyle> extends TimelineLaneConfig<S>, Partial<DownsampleConfig> {

}

export abstract class VttTimelineLane<C extends VttTimelineLaneConfig<S>, S extends TimelineLaneStyle, Q extends OmakaseVttCue, T extends OmakaseVttFile<Q>> extends BaseTimelineLane<C, S> implements VttAwareApi<Q, T> {
  protected abstract readonly _vttAdapter: VttAdapter<T>;

  protected _onVideoCueEvent$?: Observable<OmakaseVttCueEvent<Q>>;
  protected _onPlayheadCueEvent$?: Observable<OmakaseVttCueEvent<Q>>;
  protected _onScrubberCueEvent$?: Observable<OmakaseVttCueEvent<Q>>;

  constructor(config: C) {
    super(config);
  }

  get onVttFileLoaded$(): Observable<T> {
    return this._vttAdapter.vttFileLoaded$;
  }

  get onVideoCueEvent$(): Observable<OmakaseVttCueEvent<Q>> {
    if (this._onVideoCueEvent$) {
      return this._onVideoCueEvent$;
    }
    this._onVideoCueEvent$ = this.getCueEvents(this._videoController!.onVideoTimeChange$);
    return this._onVideoCueEvent$;
  }

  get onPlayheadCueEvent$(): Observable<OmakaseVttCueEvent<Q>> {
    if (this._onPlayheadCueEvent$) {
      return this._onPlayheadCueEvent$;
    }
    this._onPlayheadCueEvent$ = this.getCueEvents(this._timeline!.onPlayheadMove$);
    return this._onPlayheadCueEvent$;
  }

  get onScrubberCueEvent$(): Observable<OmakaseVttCueEvent<Q>> {
    if (this._onScrubberCueEvent$) {
      return this._onScrubberCueEvent$;
    }
    this._onScrubberCueEvent$ = this.getCueEvents(this._timeline!.onScrubberMove$);
    return this._onScrubberCueEvent$;
  }

  get vttUrl(): string | undefined {
    return this._vttAdapter.vttUrl;
  }

  get vttFile(): T | undefined {
    return this._vttAdapter.vttFile;
  }

  set vttUrl(vttUrl: string | undefined) {
    this._vttAdapter.vttUrl = vttUrl;
  }

  set vttFile(vttFile: T | undefined) {
    this._vttAdapter.vttFile = vttFile;
  }

  loadVtt(vttUrl: string, options: VttLoadOptions = {}): Observable<T | undefined> {
    if (!options.axiosConfig && AuthUtil.authentication) {
      options.axiosConfig = AuthUtil.getAuthorizedAxiosConfig(vttUrl, AuthUtil.authentication);
    }
    return this._vttAdapter.loadVtt(vttUrl, options);
  }

  getVttLoadOptions(axiosConfig?: AxiosRequestConfig): VttLoadOptions {
    return {
      axiosConfig,
      downsampleConfig: {
        downsamplePeriod: this._config.downsamplePeriod ?? VTT_DOWNSAMPLE_CONFIG_DEFAULT.downsamplePeriod,
        downsampleStrategy: this._config.downsampleStrategy ?? VTT_DOWNSAMPLE_CONFIG_DEFAULT.downsampleStrategy
      }
    }
  }

  private getCueEvents(source$: Observable<VideoTimeChangeEvent | PlayheadMoveEvent | ScrubberMoveEvent>): Observable<OmakaseVttCueEvent<Q>> {
    if (!this._videoController) {
      throw Error('Video controller is not ready');
    }
    if (!this._timeline) {
      throw Error('Timeline setup is not done');
    }
    let visibleCues: Q[] = [];
    return source$.pipe(takeUntil(this._destroyed$)).pipe(sampleTime(sampleTimeSyncVideoMetadata)).pipe(
      map((time) => {
        const currentTime = (time as VideoTimeChangeEvent).currentTime ?? this._videoController!.parseTimecodeToTime((time as PlayheadMoveEvent | ScrubberMoveEvent).timecode);
        const startTime = currentTime - sampleTimeSyncVideoMetadata / 1000;
        const cues = this.vttFile!.findCues(startTime, currentTime);
        if (!cues) {
          return [];
        }
        const newVisibleCues = cues.filter((c: Q) => c.endTime >= startTime && c.startTime <= currentTime);
        const newCues = newVisibleCues.filter((c) => !visibleCues.find((q) => c.index === q.index));
        const oldCues = visibleCues.filter((q) => !newVisibleCues.find((c) => c.index === q.index));
        visibleCues = newVisibleCues;
        return newCues.map((cue) => ({cue, action: 'entry'} as OmakaseVttCueEvent<Q>))
          .concat(...oldCues.map((cue) => ({cue, action: 'exit'} as OmakaseVttCueEvent<Q>)));
      }),
      mergeAll()
    );
  }

  override destroy() {
    super.destroy();

    this._vttAdapter.destroy();
  }
}
