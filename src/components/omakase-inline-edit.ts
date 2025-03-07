import {Subject} from 'rxjs';
import {OmakaseTimecodeEdit} from './omakase-timecode-edit';
import {TimecodeObject, Video} from '../video/model';

export class OmakaseInlineEdit extends HTMLElement {
  onEdit$: Subject<string> = new Subject();

  private _text = '';
  private _isEditing = false;
  private _isClicked = false;
  private _validationFn?: (text: string) => boolean;

  private _container: HTMLDivElement;
  private _input: HTMLInputElement | OmakaseTimecodeEdit;
  private _span: HTMLSpanElement;
  private _select?: HTMLSelectElement;

  constructor() {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('omakase-inline-edit-editable-text');

    this._span = document.createElement('span');
    this._span.classList.add('omakase-inline-edit-readonly-text');
    this._span.textContent = this._text;

    this._input = document.createElement('input');
    this._input.classList.add('omakase-inline-edit-input');
    this._input.type = 'text';
    this._input.value = this._text;
    this._input.style.display = 'none';

    this._container.appendChild(this._span);
    this._container.appendChild(this._input);
    this.appendChild(this._container);

    const style = document.createElement('style');
    style.textContent = `
        .omakase-inline-edit-editable-text {
          display: inline-block;
          width: 100%;
        }
        .omakase-inline-edit-readonly-text {
          display: inline-block;
          min-width: 100px;
          max-width: 100%;
          height: 100%;
        }
        .omakase-inline-edit-dropdown {
          font-size: 16px;
          border: none;
          outline: none;
          background: transparent;
        }
        .omakase-inline-edit-input {
          padding: 4px;
          font-size: 16px;
          outline: none;
        }
        .omakase-inline-edit-input-error {
          border-color: red
        }
      `;

    this.appendChild(style);

    this._span.addEventListener('click', this.handleClick.bind(this));
    this._input.addEventListener('keydown', this.handleKeyDown.bind(this));
    this._input.addEventListener('keyup', this.handleKeyUp.bind(this));
    this._input.addEventListener('blur', this.undoChanges.bind(this));
    this._input.addEventListener('click', this.stopPropagation.bind(this));
  }

  set validationFn(validationFn: (text: string) => boolean) {
    this._validationFn = validationFn;
  }

  setText(text: string) {
    this._text = text;
    this._span.textContent = text;
    this._input.value = text;
  }

  setTimecode(timecode: string, video: Video, minTime?: number, maxTime?: number) {
    this._container.removeChild(this._input);
    this._input = document.createElement('omakase-timecode-edit') as OmakaseTimecodeEdit;
    this._container.appendChild(this._input);
    this._input.video = video;
    this._input.value = timecode;

    if (minTime) {
      this._input.minTime = minTime;
    }

    if (maxTime) {
      this._input.maxTime = maxTime;
    }

    this._validationFn = () => (this._input as OmakaseTimecodeEdit).isTimecodeValid();

    this._input.addEventListener('keydown', this.handleKeyDown.bind(this));
    this._input.addEventListener('keyup', this.handleKeyUp.bind(this));
    this._input.addEventListener('blur', this.undoChanges.bind(this));
    this._input.addEventListener('click', this.stopPropagation.bind(this));

    this._span.textContent = timecode;
    this._text = timecode;
  }

  setOptions(options: string[]) {
    this._span.style.display = 'none';
    this._input.style.display = 'none';
    this._select = document.createElement('select');
    this._select.classList.add('omakase-inline-edit-dropdown');
    this._select.addEventListener('click', this.stopPropagation.bind(this));
    this._select.value = this._text;
    this._container.appendChild(this._select);
    for (const optionText of options) {
      const optionElement = document.createElement('option');
      optionElement.value = optionText;
      optionElement.text = optionText;
      optionElement.selected = optionText === this._text;
      this._select.appendChild(optionElement);
    }
    this._select.onchange = () => {
      this.onEdit$.next(this._select!.value);
    };
  }

  private enableEditMode() {
    if (this._isEditing) {
      return;
    }
    this._isEditing = true;
    this._span.style.display = 'none';
    this._input.style.display = 'inline-block';
    this._input.value = this._text;
    this._input.focus();
  }

  private disableEditMode() {
    if (!this._isEditing) {
      return;
    }
    if (this._text !== this._input.value) {
      if (this._validationFn && !this._validationFn(this._input.value)) {
        return;
      }
      this._text = this._input.value;
      this._span.textContent = this._text;
      this.onEdit$.next(this._text);
    }
    this._isEditing = false;
    this._span.style.display = 'inline-block';
    this._input.style.display = 'none';
    this._input.classList.remove('omakase-inline-edit-input-error');
  }

  private undoChanges() {
    this._input.value = this._text;
    this.disableEditMode();
  }

  private stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  private handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (this._isClicked) {
      this.enableEditMode();
      this._isClicked = false;
    } else {
      this._isClicked = true;
    }
    setTimeout(() => {
      if (!this._isEditing) {
        this._container.click();
        this._isClicked = false;
      }
    }, 200);
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.disableEditMode();
    } else if (event.key === 'Escape') {
      this.undoChanges();
    }
  }

  private handleKeyUp() {
    if (!this._validationFn) {
      return;
    }
    if (this._validationFn(this._input.value)) {
      this._input.classList.remove('omakase-inline-edit-input-error');
    } else {
      this._input.classList.add('omakase-inline-edit-input-error');
    }
  }
}
