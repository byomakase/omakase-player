import {Subject, Subscription, takeUntil} from 'rxjs';
import {VideoApi} from '../api';
import {nextCompleteSubject} from '../util/rxjs-util';
import {OmakaseTimeRange} from './omakase-time-range';

export class OmakaseTimeDisplay extends HTMLElement {
  private _video?: VideoApi;
  private _timeRange?: OmakaseTimeRange;
  private _destroyed$ = new Subject<void>();

  private _timeChangeSubscription?: Subscription;

  constructor() {
    super();
  }

  set video(video: VideoApi) {
    this._video = video;
    this._video.onVideoLoaded$.pipe(takeUntil(this._destroyed$)).subscribe((loaded) => {
      if (loaded) {
        this.querySelector('span')!.textContent = this._video!.getCurrentTimecode();
      }
    });
    this._timeChangeSubscription = this._video.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe((time) => {
      if (this._video && this._video.isVideoLoaded()) {
        this.querySelector('span')!.textContent = this._video.formatToTimecode(time.currentTime);
      }
    });
  }

  set timeRange(timeRange: OmakaseTimeRange) {
    this._timeRange = timeRange;
    this._timeChangeSubscription?.unsubscribe();
    this._timeRange.onMouseOver$.pipe(takeUntil(this._destroyed$)).subscribe((time) => {
      if (this._video && this._video.isVideoLoaded()) {
        this.querySelector('span')!.textContent = this._video.formatToTimecode(time);
      }
    });
  }

  connectedCallback() {
    this.innerHTML = `<span></span>`;
  }

  disconnectedCallback() {
    nextCompleteSubject(this._destroyed$);
  }
}
