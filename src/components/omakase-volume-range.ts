import {MediaChromeRange} from 'media-chrome';
import {Subject, takeUntil} from 'rxjs';
import {VideoControllerApi} from '../video';
import {nextCompleteSubject} from '../util/rxjs-util';

export class OmakaseVolumeRange extends MediaChromeRange {
  private _videoController?: VideoControllerApi;
  private _destroyed$ = new Subject<void>();

  get videoController() {
    return this._videoController;
  }

  set videoController(videoController: VideoControllerApi | undefined) {
    this._videoController = videoController;
    if (this._videoController) {
      this.setVolume(this._videoController.getAudioOutputVolume());
      this._videoController.onAudioOutputVolumeChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
        this.setVolume(event.volume);
      });
    }
  }

  constructor() {
    super();
    this.range.addEventListener('input', () => {
      if (this._videoController) {
        this._videoController.setAudioOutputVolume(parseFloat(this.range.value));
      }
    });
  }

  setVolume(value: number) {
    this.range.valueAsNumber = value;
    this.range.setAttribute('aria-valuetext', `${Math.round(value * 100)}%`);
    this.updateBar();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.range.setAttribute('aria-label', 'volume');
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    nextCompleteSubject(this._destroyed$);
  }
}
