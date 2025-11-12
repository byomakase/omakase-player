import {BehaviorSubject} from 'rxjs';
import {OmakaseDropdownOption} from './omakase-dropdown-option';

export interface OmakaseDropdownListItem {
  value: any;
  label: string;
  active?: boolean;
}

export class OmakaseDropdownList extends HTMLElement {
  private _title?: HTMLDivElement;
  private _list?: HTMLDivElement;
  private _selectedOption$ = new BehaviorSubject<OmakaseDropdownListItem | undefined>(undefined);

  constructor() {
    super();
  }

  set width(width: number) {
    this.style.width = width + 'px';
  }

  get width(): number {
    return parseFloat(this.getAttribute('width') ?? '100');
  }

  get selectedOption$() {
    return this._selectedOption$;
  }

  set type(type: 'radio' | 'checkbox' | 'default') {
    this.setAttribute('type', type);
  }

  get type(): 'radio' | 'checkbox' | 'default' {
    if (this.getAttribute('type') === 'radio') {
      return 'radio';
    } else if (this.getAttribute('type') === 'checkbox') {
      return 'checkbox';
    } else {
      return 'default';
    }
  }

  setTitle(title: string) {
    if (this._title) {
      this._title.innerText = title;
    }
  }

  setOptions(options: OmakaseDropdownListItem[]) {
    this._list!.innerHTML = '';
    this.selectedOption$.next(undefined);
    options.forEach((option) => {
      const optionElement = document.createElement('omakase-dropdown-option') as OmakaseDropdownOption;
      optionElement.classList.add(`omakase-dropdown-option-${this.type}`);
      optionElement.innerText = option.label;
      optionElement.setAttribute('value', option.value);
      optionElement.setAttribute('title', option.label);
      if (option.active) {
        optionElement.classList.add('active');
      }
      optionElement.addEventListener('click', () => {
        this._selectedOption$.next({
          value: optionElement.getAttribute('value'),
          label: optionElement.innerText,
          active: option.active,
        });
      });
      this._list!.appendChild(optionElement);
    });
  }

  updateOptions(options: OmakaseDropdownListItem[]) {
    this.querySelectorAll('omakase-dropdown-option').forEach((optionElement) => {
      if (options.find((option) => option.value === optionElement.getAttribute('value'))?.active) {
        optionElement.classList.add('active');
      } else {
        optionElement.classList.remove('active');
      }
    });
  }

  connectedCallback() {
    this.style.width = this.width + 'px';

    if (!this.getAttribute('type')) {
      this.type = 'default';
    }

    if (!this.getAttribute('multiselect')) {
      this.selectedOption$.subscribe((newValue) => {
        this.querySelectorAll('omakase-dropdown-option').forEach((option) => {
          if (option.getAttribute('value') === newValue?.value || (!option.getAttribute('value') && !newValue?.value)) {
            option.classList.add('active');
          } else {
            option.classList.remove('active');
          }
        });
      });
    }

    if (this.getAttribute('title')) {
      this._title = document.createElement('div');
      this._title.classList.add('omakase-dropdown-title');
      this._title.innerText = this.getAttribute('title')!;
      this.appendChild(this._title);
    }

    this._list = document.createElement('div');
    this._list.classList.add('omakase-dropdown-container');
    this.appendChild(this._list);

    const options = this.querySelectorAll('omakase-dropdown-option');
    options.forEach((option) => {
      const clone = option.cloneNode(true) as HTMLElement;
      clone.classList.add(`omakase-dropdown-option-${this.type}`);
      clone.addEventListener('click', () => {
        this._selectedOption$.next({
          value: option.getAttribute('value'),
          label: option.innerHTML,
        });
      });
      this.removeChild(option);
      this._list!.appendChild(clone);
      if (option.hasAttribute('selected')) {
        this._selectedOption$.next({
          value: option.getAttribute('value'),
          label: option.innerHTML,
        });
      }
    });
  }
}
