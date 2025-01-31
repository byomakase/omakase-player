import {timecodeNonDropRegex, timecodeDropRegex, TimecodeUtil} from '../util/timecode-util';

export class OmakaseTimecodeEdit extends HTMLElement {
  static get observedAttributes() {
    return ['frameRate', 'duration', 'maxTimecode', 'minTimecode'];
  }

  private _timecode: string = '';
  private _container: HTMLDivElement;
  private _input: HTMLInputElement;
  private _frameRate: number = 30;
  private _isDropFrameRate: boolean = false;
  private _duration: number;
  private _maxTimecode?: string;
  private _minTimecode?: string;
  private _dropFrameRates = ['29.97', '59.94'];

  constructor() {
    super();

    this.frameRate = parseFloat(this.getAttribute('frameRate') ?? '30');
    this._duration = parseFloat(this.getAttribute('duration') ?? '0');

    this._maxTimecode = this.getAttribute('maxTimecode') ?? undefined;
    this._minTimecode = this.getAttribute('minTimecode') ?? undefined;

    this._container = document.createElement('div');
    this._container.classList.add('omakase-timecode-edit');

    this._input = document.createElement('input');
    this._input.type = 'text';

    if (!this.isTimecodeValid()) {
      this._input.classList.add('omakase-timecode-edit-input-invalid');
    }
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

  set minTimecode(timecode: string) {
    if ((this._isDropFrameRate && timecode.match(timecodeDropRegex)) || timecode.match(timecodeNonDropRegex)) {
      this._minTimecode = timecode;
    } else {
      throw Error('Timecode format for minTimecode is incorrect');
    }
  }

  set maxTimecode(timecode: string) {
    if ((this._isDropFrameRate && timecode.match(timecodeDropRegex)) || timecode.match(timecodeNonDropRegex)) {
      this._maxTimecode = timecode;
    } else {
      throw Error('Timecode format for maxTimecode is incorrect');
    }
  }

  set duration(duration: number) {
    this._duration = duration;
  }

  set frameRate(newFrameRate: number) {
    this._frameRate = newFrameRate;
    this._isDropFrameRate = this._dropFrameRates.includes(this._frameRate.toFixed(2));
  }

  get frameRate() {
    return this._frameRate;
  }

  get currentTime() {
    if (!this.isTimecodeValid) {
      return undefined;
    }

    const timecodeElements = this.timecode.split(/[:;]/).map((el) => parseInt(el));

    let time = timecodeElements[2] + timecodeElements[3] * (1 / this.frameRate);
    time += timecodeElements[1] * 60;
    time += timecodeElements[0] * 3600;
    time += 0.02 / this.frameRate;

    return time;
  }

  public override focus(options?: FocusOptions): void {
    this._input.focus(options);
  }

  public isTimecodeValid() {
    const timecodeElements = this.timecode.split(/[:;]/).map((el) => parseInt(el));
    if (timecodeElements.filter((el) => !Number.isNaN(el)).length !== 4) {
      return false;
    }

    if (this._minTimecode && this.timecode < this._minTimecode) {
      return false;
    }

    if (this._maxTimecode && this.timecode > this._maxTimecode) {
      return false;
    }

    if (timecodeElements[3] >= this.frameRate) {
      return false;
    }
    if (this.timecode.match(timecodeDropRegex) && this._isDropFrameRate && this.currentTime! < this._duration) {
      if (timecodeElements[1] % 10 === 0 || timecodeElements[2] !== 0) {
        return true;
      }
      if (timecodeElements[1] % 10 !== 0 && timecodeElements[2] === 0 && timecodeElements[3] >= this.numberOfDropFrames!) {
        return true;
      }
      return false;
    }
    if (this.timecode.match(timecodeNonDropRegex) && !this._isDropFrameRate && this.currentTime! < this._duration) {
      return true;
    }

    return false;
  }

  private handleKeyUp(event: KeyboardEvent) {
    event.preventDefault();

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
    }
  }

  private handleBlur() {
    this.dispatchEvent(new Event('blur'));
  }

  private validate() {
    if (this.isTimecodeValid()) {
      this._input.classList.remove('omakase-timecode-edit-input-invalid');
    } else if (!this._input.classList.contains('omakase-timecode-edit-input-invalid')) {
      this._input.classList.add('omakase-timecode-edit-input-invalid');
    }
  }

  public nextTimecode() {
    const timecodeElements = this.timecode.split(/[:;]/).map((el) => parseInt(el));
    timecodeElements[3]++;
    if (timecodeElements[3] >= this.frameRate) {
      timecodeElements[3] = 0;
      timecodeElements[2]++;
      if (timecodeElements[2] > 59) {
        timecodeElements[2] = 0;
        timecodeElements[1]++;

        if (this._isDropFrameRate && timecodeElements[1] % 10 !== 0) {
          timecodeElements[3] = this.numberOfDropFrames!;
        }

        if (timecodeElements[1] > 59) {
          timecodeElements[1] = 0;
          timecodeElements[0]++;
        }
      }
    }

    if (this._isDropFrameRate) {
      const time = timecodeElements
        .slice(0, -1)
        .map((el) => el.toString().padStart(2, '0'))
        .join(':');
      this.timecode = time + ';' + timecodeElements[3].toString().padStart(2, '0');
    } else {
      this.timecode = timecodeElements.map((el) => el.toString().padStart(2, '0')).join(':');
    }
  }

  public previousTimecode() {
    const timecodeElements = this.timecode.split(/[:;]/).map((el) => parseInt(el));
    timecodeElements[3]--;
    if (this._isDropFrameRate && timecodeElements[1] % 10 !== 0 && timecodeElements[3] < this.numberOfDropFrames!) {
      timecodeElements[3] = -1;
    }
    if (timecodeElements[3] < 0) {
      timecodeElements[3] = Math.round(this.frameRate) - 1;
      timecodeElements[2]--;
      if (timecodeElements[2] < 0) {
        timecodeElements[2] = 59;
        timecodeElements[1]--;

        if (timecodeElements[1] < 0) {
          timecodeElements[1] = 59;
          timecodeElements[0]--;
          if (timecodeElements[0] < 0) {
            return; //invalid timecode
          }
        }
      }
    }

    if (this._isDropFrameRate) {
      const time = timecodeElements
        .slice(0, -1)
        .map((el) => el.toString().padStart(2, '0'))
        .join(':');
      this.timecode = time + ';' + timecodeElements[3].toString().padStart(2, '0');
    } else {
      this.timecode = timecodeElements.map((el) => el.toString().padStart(2, '0')).join(':');
    }
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

  get numberOfDropFrames(): number | undefined {
    if (this._isDropFrameRate) {
      return Math.round(this.frameRate * 0.066666);
    }
    return undefined;
  }
}
