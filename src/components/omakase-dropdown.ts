import {BehaviorSubject, Subject} from 'rxjs';

export interface OmakaseDropdownOption {
  value: any;
  label: string;
}

export class OmakaseDropdown extends HTMLElement {
  private _title?: HTMLDivElement;
  private _dropdown?: HTMLDivElement;
  private _selectedOption$ = new BehaviorSubject<OmakaseDropdownOption | undefined>(undefined);

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

  connectedCallback() {
    this.style.display = 'none';
    this.style.width = this.width + 'px';

    this.selectedOption$.subscribe((newValue) => {
      this.querySelectorAll('omakase-dropdown-option').forEach((option) => {
        if (option.getAttribute('value') === newValue?.value) {
          option.classList.add('active');
        } else {
          option.classList.remove('active');
        }
      });
    });
    document.addEventListener('click', (event) => {
      if (!this.contains(event.target as Node)) {
        this.style.display = 'none';
      }
    });

    if (this.getAttribute('title')) {
      this._title = document.createElement('div');
      this._title.classList.add('omakase-dropdown-title');
      this._title.innerText = this.getAttribute('title')!;
      this.appendChild(this._title);
    }

    this._dropdown = document.createElement('div');
    this._dropdown.classList.add('omakase-dropdown-container');
    this.appendChild(this._dropdown);

    const options = this.querySelectorAll('omakase-dropdown-option');
    options.forEach((option) => {
      const clone = option.cloneNode(true) as HTMLElement;
      clone.addEventListener('click', () => {
        this._selectedOption$.next({
          value: option.getAttribute('value'),
          label: option.innerHTML,
        });
      });
      this.removeChild(option);
      this._dropdown!.appendChild(clone);
      if (option.hasAttribute('selected')) {
        this._selectedOption$.next({
          value: option.getAttribute('value'),
          label: option.innerHTML,
        });
      }
    });
  }
}
