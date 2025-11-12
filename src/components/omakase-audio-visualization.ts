import {Subject, takeUntil, sampleTime, merge, interval} from 'rxjs';
import {VideoControllerApi} from '../video';
import {nextCompleteSubject} from '../util/rxjs-util';
import {DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG} from '../player-chroming/model';

export class OmakaseAudioVisualization extends HTMLElement {
  private _peakArray: number[] = [];
  private _historyArray: number[][] = [];
  private _barElements: SVGRectElement[] = [];
  private _destroyed$ = new Subject<void>();
  private _silenceBreaker$ = new Subject<void>();

  protected _barCount = 7;
  protected _maxHistoryCount = 4;
  protected _sampleTime = 50;
  protected _maxHeight = 0.25;
  protected _fillColors = this.getAttribute('fill')?.split(' ') ?? DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG.visualizationConfig.fillColors;
  protected _strokeColor = this.getAttribute('stroke') ?? DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG.visualizationConfig.strokeColor;

  connectedCallback() {
    this.innerHTML = `<svg width="100%" height="70%" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="paint0_linear_2090_635" x1="41" y1="41" x2="159" y2="159" gradientUnits="userSpaceOnUse">
            ${this._fillColors.map((color, index) => `<stop offset="${index / (this._fillColors.length - 1)}" stop-color="${color}"/>`)}
          </linearGradient>
        </defs>
        <rect id="bar1" class="bar" x="16"  y="75" width="12" height="50" rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
        <rect id="bar2" class="bar" x="39"  y="66" width="12" height="67" rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
        <rect id="bar3" class="bar" x="66"  y="33" width="12" height="133" rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
        <rect id="bar4" class="bar" x="94"  y="50" width="12" height="100" rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
        <rect id="bar5" class="bar" x="122" y="83" width="12" height="33"  rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
        <rect id="bar6" class="bar" x="150" y="58" width="12" height="89"  rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
        <rect id="bar7" class="bar" x="178" y="75" width="12" height="50"  rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>
      </svg>`;

    const svg = this.getElementsByTagName(`svg`)[0] as SVGElement;
    for (let i = 0; i < this._barCount; i++) {
      this._barElements.push(svg.childNodes[3 + 2 * i] as SVGRectElement);
    }
  }

  disconnectedCallback() {
    nextCompleteSubject(this._destroyed$);
  }

  attachVideoController(videoController: VideoControllerApi) {
    videoController.createMainAudioPeakProcessor().subscribe((peakProcessorMessage$) => {
      peakProcessorMessage$.pipe(takeUntil(this._destroyed$)).subscribe((message) => {
        const peaks: number[] = (message.data as any).peaks;
        this.addPeakValue(peaks.reduce((sum, peak) => sum + peak / peaks.length, 0));
      });
      videoController.onVideoTimeChange$.pipe(sampleTime(this._sampleTime), takeUntil(this._destroyed$)).subscribe(() => {
        this.draw();
      });
      merge(videoController.onPause$, videoController.onEnded$)
        .pipe(takeUntil(this._destroyed$))
        .subscribe(() => {
          this._silenceBreaker$.next();
          interval(this._sampleTime)
            .pipe(takeUntil(this._destroyed$), takeUntil(this._silenceBreaker$))
            .subscribe(() => {
              this.addPeakValue(0);
              this.draw();
            });
        });
      videoController.onPlay$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
        this._silenceBreaker$.next();
      });
    });
  }

  private addPeakValue(value: number) {
    if (this._peakArray.length >= this._barCount) {
      this._peakArray.shift();
    }
    this._peakArray.push(value);
  }

  private draw() {
    let nonZeroValue = false;

    for (let i = 0; i < this._peakArray.length; i++) {
      const value = this._peakArray[i];
      let maxValue = 0;

      maxValue = value;
      for (const historyItem of this._historyArray) {
        maxValue = Math.max(maxValue, historyItem[i]);
      }

      if (maxValue > 0) {
        nonZeroValue = true;
      }

      if (this._barElements[i] && !isNaN(maxValue)) {
        this._barElements[i].setAttribute('height', (maxValue * 200).toString());
        this._barElements[i].setAttribute('y', ((1 - maxValue) * 100).toString());
      }
    }

    if (this._historyArray.length >= this._maxHistoryCount) {
      this._historyArray.shift();
    }
    this._historyArray.push([...this._peakArray]);

    if (!nonZeroValue) {
      this._silenceBreaker$.next();
    }
  }
}
