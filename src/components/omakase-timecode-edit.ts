import Decimal from 'decimal.js';
import {TimecodeUtil} from '../util/timecode-util';
import {FrameRateUtil} from '../util/frame-rate-util';
import {TimecodeObject, Video} from '../video/model';

export class OmakaseTimecodeEdit extends HTMLElement {
  private _timecode: string = '';
  private _container: HTMLDivElement;
  private _input: HTMLInputElement;
  private _video?: Video;

  private _ffom?: TimecodeObject;
  private _maxTime?: number;
  private _minTime?: number;
  private _isValidTimecode: boolean = true;

  constructor() {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('omakase-timecode-edit');

    this._input = document.createElement('input');
    this._input.type = 'text';

    this._input.classList.add('omakase-timecode-edit-input');

    this._input.addEventListener('keyup', this.handleKeyUp.bind(this));
    this._input.addEventListener('keydown', this.handleKeyDown.bind(this));
    this._input.addEventListener('blur', this.handleBlur.bind(this));

    this._container.appendChild(this._input);
  }

  public connectedCallback() {
    this.appendChild(this._container);
    this.appendStyle();
  }

  private appendStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .omakase-timecode-edit {
        display: inline-block;
        width: 90%;
      }

      .omakase-timecode-edit-input-invalid {
        border-color: red;
      }

      .omakase-timecode-edit-input {
        outline: none;
        width: 100%;
        padding: 4px;
        font-size: 16px;
      }

      input {
        width: 100%;
        box-sizing: border-box;
      }
    `;
    this.appendChild(style);
  }

  set minTime(time: number | undefined) {
    if (time && time < 0) {
      time = 0;
    }
    this._minTime = time;
  }

  set maxTime(time: number | undefined) {
    this._maxTime = time;
  }

  set ffom(ffom: TimecodeObject | undefined) {
    this._ffom = ffom;
  }

  get video(): Video | undefined {
    return this._video;
  }

  set video(video: Video | undefined) {
    this._video = video;
    this._ffom = video?.ffomTimecodeObject;
  }

  get frameRate() {
    if (!this._video) {
      throw new Error('Video not set');
    }
    return this._video.frameRate;
  }

  get duration() {
    if (!this._video) {
      throw new Error('Video not set');
    }
    return this._video.duration;
  }

  get isDropFrameRate() {
    if (!this._video) {
      throw new Error('Video not set');
    }

    return this._video.dropFrame;
  }

  get currentFrame() {
    try {
      return TimecodeUtil.parseTimecodeToFrame(this.timecode, new Decimal(this.frameRate), this._ffom);
    } catch (e) {
      console.log(e);
      return undefined;
    }
  }

  get durationInFrames() {
    return new Decimal(this.duration).mul(new Decimal(this.frameRate)).toNumber();
  }

  set disabled(disabled: boolean) {
    this._input.disabled = disabled;
  }

  public override focus(options?: FocusOptions): void {
    this._input.focus(options);
  }

  public isTimecodeValid() {
    if (!this._video) {
      console.error('Video not set');
      return false;
    }

    const currentFrame = this.currentFrame;

    if (currentFrame === undefined) {
      return false;
    }

    const currentFrameObject = TimecodeUtil.parseTimecodeToTimecodeObject(this.timecode);

    if (currentFrameObject.frames >= this.frameRate) {
      return false;
    }
    if (this._minTime && currentFrame < FrameRateUtil.videoTimeToVideoFrameNumber(this._minTime, this._video)) {
      return false;
    }

    if (this._maxTime && currentFrame > FrameRateUtil.videoTimeToVideoFrameNumber(this._maxTime, this._video)) {
      return false;
    }

    if (currentFrame > this.durationInFrames) {
      return false;
    }

    return true;
  }

  private handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();

    if (this._input.disabled) {
      return;
    }

    if (event.key === 'ArrowUp') {
      this.nextTimecode();
    } else if (event.key === 'ArrowDown') {
      this.previousTimecode();
    } else {
      const target = event.target as HTMLInputElement;
      this.timecode = target.value;
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
    } else if (event.key === 'Enter' && this.isTimecodeValid() && !this._input.disabled) {
      this.dispatchEvent(new Event('submit'));
    }
  }

  private handleBlur() {
    this.dispatchEvent(new Event('blur'));
  }

  private validate() {
    if (this.isTimecodeValid()) {
      this._isValidTimecode = true;
      this._input.classList.remove('omakase-timecode-edit-input-invalid');
    } else {
      this._isValidTimecode = false;
      this._input.classList.add('omakase-timecode-edit-input-invalid');
    }
  }

  public nextTimecode() {
    const currentFrame = this.currentFrame;
    const lastFrame = FrameRateUtil.videoTimeToVideoFrameNumber(this._video!.duration, this._video!);
    if (currentFrame === undefined || currentFrame >= lastFrame || !this._isValidTimecode) {
      return;
    }
    const nextFrame = currentFrame + 1;
    const nextFrameTimeDecimal = FrameRateUtil.frameNumberToTimeDecimal(nextFrame, this.frameRate);
    this.timecode = TimecodeUtil.formatDecimalTimeToTimecode(nextFrameTimeDecimal, this.video!);
  }

  public previousTimecode() {
    const currentFrame = this.currentFrame;
    if (currentFrame === undefined || currentFrame <= 0 || !this._isValidTimecode) {
      return;
    }
    const nextFrame = currentFrame - 1;
    const nextFrameTimeDecimal = FrameRateUtil.frameNumberToTimeDecimal(nextFrame, this.frameRate);
    this.timecode = TimecodeUtil.formatDecimalTimeToTimecode(nextFrameTimeDecimal, this.video!);
  }

  set timecode(timecode: string) {
    this._timecode = timecode;
    this._input.value = this.timecode;
    this.validate();
  }

  get timecode() {
    return this._timecode;
  }

  get value() {
    return this.timecode;
  }

  set value(timecode: string) {
    this.timecode = timecode;
  }
}
