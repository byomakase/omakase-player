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

  protected _viewboxWidth = 400;
  protected _viewboxHeight = 200;
  protected _barCount = 15;
  protected _initialBars = [0.25, 0.17, 0.33, 0.5, 0.67, 0.33, 0.5, 0.33, 0.2, 0.3, 0.45, 0.3];
  protected _maxHistoryCount = 5;
  protected _sampleTime = 50;
  protected _maxHeight = 0.25;
  protected _smoothingFactor = 0.8;
  protected _dbRangeMin = -46;
  protected _dbRangeMax = 3;
  protected _fillColors = this.getAttribute('fill')?.split(' ') ?? DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG.visualizationConfig.fillColors;
  protected _strokeColor = this.getAttribute('stroke') ?? DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG.visualizationConfig.strokeColor;

  connectedCallback() {
    const initialArray = [];
    let svg = `<svg width="100%" height="70%" viewBox="0 0 ${this._viewboxWidth} ${this._viewboxHeight}">
        <defs>
          <linearGradient id="paint0_linear_2090_635" x1="0" y1="0" x2="${this._viewboxWidth}" y2="${this._viewboxHeight}" gradientUnits="userSpaceOnUse">
            ${this._fillColors.map((color, index) => `<stop offset="${index / (this._fillColors.length - 1)}" stop-color="${color}"/>`)}
          </linearGradient>
        </defs>`;
    for (let i = 1; i <= this._barCount; i++) {
      const value = this._initialBars[(i - 1) % this._initialBars.length];
      initialArray.push(value);
      svg += `<rect id="bar${i}" class="bar" x="${i * (this._viewboxWidth / (this._barCount + 1))}"  y="${(this._viewboxHeight - value * this._viewboxHeight) / 2}" width="12" height="${value * this._viewboxHeight}" rx="6" fill="url(#paint0_linear_2090_635)" stroke="${this._strokeColor}"/>`;
    }
    svg += `</svg>`;
    this.innerHTML = svg;

    const svgElement = this.getElementsByTagName(`svg`)[0] as SVGElement;
    for (let i = 0; i < this._barCount; i++) {
      this._barElements.push(svgElement.childNodes[2 + i] as SVGRectElement);
    }

    for (let i = 0; i < this._maxHistoryCount; i++) {
      this._historyArray.push(initialArray);
    }
  }

  disconnectedCallback() {
    nextCompleteSubject(this._destroyed$);
  }

  attachVideoController(videoController: VideoControllerApi) {
    videoController.createMainAudioPeakProcessor().subscribe((peakProcessorMessage$) => {
      peakProcessorMessage$.pipe(takeUntil(this._destroyed$)).subscribe((message) => {
        const peaks: number[] = (message.data as any).peaks;
        this.addPeakValue(Math.max(...peaks));
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
    while (this._peakArray.length < this._barCount) {
      this._peakArray.push(value);
    }
  }

  private draw() {
    let nonZeroValue = false;

    for (let i = 0; i < this._peakArray.length; i++) {
      const value = this._peakArray[i];

      const historyAverage = this._historyArray.reduce((sum, array) => sum + array[i], 0) / this._historyArray.length;
      const smoothedValue = this.getScaledValue((1 - this._smoothingFactor) * value + this._smoothingFactor * historyAverage);

      if (smoothedValue > 0) {
        nonZeroValue = true;
      }

      if (this._barElements[i] && !isNaN(smoothedValue)) {
        this._barElements[i].setAttribute('height', Math.max(smoothedValue * this._viewboxHeight, 1).toString());
        this._barElements[i].setAttribute('y', (Math.min((1 - smoothedValue) * this._viewboxHeight, this._viewboxHeight - 1) / 2).toString());
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

  private getScaledValue(input: number): number {
    const dbValue = (Math.log(input) * 20) / Math.log(10);
    return 1 - Math.min(Math.max((this._dbRangeMax - dbValue) / (this._dbRangeMax - this._dbRangeMin), 0), 1);
  }
}
