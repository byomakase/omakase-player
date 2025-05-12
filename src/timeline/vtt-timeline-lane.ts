import {debounce, debounceTime, map, mergeAll, Observable, sampleTime, Subject, take, takeUntil} from 'rxjs';
import {DownsampleConfig, VttAwareApi, VttLoadOptions} from '../api/vtt-aware-api';
import {OmakaseVttCue, OmakaseVttCueEvent, PlayheadMoveEvent, ScrubberMoveEvent, VideoTimeChangeEvent} from '../types';
import {BaseTimelineLane, TimelineLaneConfig, TimelineLaneStyle, VTT_DOWNSAMPLE_CONFIG_DEFAULT} from './timeline-lane';
import {VttAdapter} from '../common/vtt-adapter';
import {AuthConfig} from '../auth/auth-config';
import {AxiosRequestConfig} from 'axios';
import {OmakaseVttFile} from '../vtt';
import {errorCompleteObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {KonvaFactory} from '../konva/konva-factory';
import Konva from 'konva';

const sampleTimeSyncVideoMetadata = 100;

export interface VttTimelineLaneConfig<S extends TimelineLaneStyle> extends TimelineLaneConfig<S>, Partial<DownsampleConfig> {
  loadingAnimationEnabled?: boolean;
}

export abstract class VttTimelineLane<C extends VttTimelineLaneConfig<S>, S extends TimelineLaneStyle, Q extends OmakaseVttCue, T extends OmakaseVttFile<Q>>
  extends BaseTimelineLane<C, S>
  implements VttAwareApi<Q, T>
{
  protected abstract readonly _vttAdapter: VttAdapter<T>;

  protected _onVideoCueEvent$?: Observable<OmakaseVttCueEvent<Q>>;
  protected _onPlayheadCueEvent$?: Observable<OmakaseVttCueEvent<Q>>;
  protected _onScrubberCueEvent$?: Observable<OmakaseVttCueEvent<Q>>;

  protected readonly _onSettleLayout$: Subject<void> = new Subject<void>();
  protected readonly _isVttLoading$: Subject<void> = new Subject();
  protected readonly _isVttFinishedLoading$: Subject<void> = new Subject();

  protected _timecodedGroup?: Konva.Group;
  protected _loadingGroup?: Konva.Group;
  protected _loadingAnimation?: Konva.Animation;

  constructor(config: C) {
    super(config);
    if (this._config.loadingAnimationEnabled) {
      this._isVttLoading$.pipe(takeUntil(this._destroyed$), take(1)).subscribe(() => {
        this.startLoadingAnimation();
      });
      this._isVttFinishedLoading$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
        this.stopLoadingAnimation();
      });
      this._onSettleLayout$.pipe(takeUntil(this._destroyed$), debounceTime(500)).subscribe(() => {
        if (this._loadingAnimation?.isRunning()) {
          this.stopLoadingAnimation();
          this.startLoadingAnimation();
        }
      });
    }
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
    return passiveObservable<T | undefined>((observer) => {
      if (!options.axiosConfig && AuthConfig.authentication) {
        options.axiosConfig = AuthConfig.createAxiosRequestConfig(vttUrl, AuthConfig.authentication);
      }
      this._isVttLoading$.next();
      this._vttAdapter.loadVtt(vttUrl, options).subscribe({
        next: (value) => {
          nextCompleteObserver(observer, value);
        },
        error: (error) => {
          errorCompleteObserver(observer, error);
        },
        complete: () => {
          this._isVttFinishedLoading$.next();
        },
      });
    });
  }

  getVttLoadOptions(axiosConfig?: AxiosRequestConfig): VttLoadOptions {
    return {
      axiosConfig,
      downsampleConfig: {
        downsamplePeriod: this._config.downsamplePeriod ?? VTT_DOWNSAMPLE_CONFIG_DEFAULT.downsamplePeriod,
        downsampleStrategy: this._config.downsampleStrategy ?? VTT_DOWNSAMPLE_CONFIG_DEFAULT.downsampleStrategy,
      },
    };
  }

  protected createLoadingGroup(): Konva.Group {
    return new Konva.Group({
      width: this._timecodedGroup!.width(),
      height: this._timecodedGroup!.height(),
    });
  }

  protected createLoadingGroupObjects(): Array<Konva.Shape | Konva.Group> {
    const rect1 = KonvaFactory.createRect({
      x: this._timecodedGroup!.width() / 2 - 100,
      y: this._timecodedGroup!.height() / 2 - 5,
      width: 200,
      height: 10,
      fill: this.resolveLoadingAnimationColor(),
      opacity: 0.5,
    });
    const rect2 = KonvaFactory.createRect({
      x: this._timecodedGroup!.width() / 2 - 100,
      y: this._timecodedGroup!.height() / 2 - 5,
      width: 0,
      height: 10,
      fill: this.resolveLoadingAnimationColor(),
      opacity: 1,
    });
    return [rect1, rect2];
  }

  protected createLoadingAnimation(): Konva.Animation {
    return new Konva.Animation((_frame) => {
      const [rect1, rect2] = this._loadingGroup!.getChildren();
      rect2.width((rect2.width() + 0.25) % rect1.width());
    });
  }

  protected startLoadingAnimation() {
    if (!this._loadingGroup) {
      this._loadingGroup = this.createLoadingGroup();
      this._timecodedGroup!.add(this._loadingGroup);
    } else {
      this._loadingGroup.destroyChildren();
    }
    this._loadingGroup.add(...this.createLoadingGroupObjects());
    if (!this._loadingAnimation) {
      this._loadingAnimation = this.createLoadingAnimation();
    }
    this._loadingAnimation.start();
  }

  protected stopLoadingAnimation() {
    if (this._loadingAnimation) {
      this._loadingAnimation.stop();
    }
    if (this._loadingGroup) {
      this._loadingGroup.destroy();
      delete this._loadingGroup;
    }
  }

  protected resolveLoadingAnimationColor(): string {
    switch (this._timeline?.config.style.loadingAnimationTheme) {
      case 'light':
        return '#C8CACD';
      case 'dark':
        return '#7B85B4';
      default:
        return '#C8CACD';
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
    return source$
      .pipe(takeUntil(this._destroyed$))
      .pipe(sampleTime(sampleTimeSyncVideoMetadata))
      .pipe(
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
          return newCues.map((cue) => ({cue, action: 'entry'}) as OmakaseVttCueEvent<Q>).concat(...oldCues.map((cue) => ({cue, action: 'exit'}) as OmakaseVttCueEvent<Q>));
        }),
        mergeAll()
      );
  }

  override destroy() {
    super.destroy();

    this._vttAdapter.destroy();
  }
}
