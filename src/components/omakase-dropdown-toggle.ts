import {OmakaseDropdown} from './omakase-dropdown';

export class OmakaseDropdownToggle extends HTMLElement {
  static get observedAttributes() {
    return ['dropdown'];
  }

  private _dropdown?: OmakaseDropdown;
  private _span?: HTMLSpanElement;

  get span(): HTMLSpanElement | undefined {
    return this._span;
  }

  constructor() {
    super();
  }

  attributeChangedCallback(name: string, _oldValue: any, newValue: any) {
    if (name === 'dropdown') {
      this._dropdown = document.getElementById(newValue) as OmakaseDropdown;
      if (!this._dropdown) {
        return;
      }
      setTimeout(() => {
        this._span!.innerText = this._dropdown!.selectedOption$.getValue()?.label ?? '';
        this._dropdown!.selectedOption$.subscribe((value) => {
          this._span!.innerText = value?.label || '';
          this._dropdown!.style.display = 'none';
        });
      });
    }
  }

  connectedCallback() {
    this._span = document.createElement('span');
    this._span.classList.add('omakase-dropdown-toggle');
    this._span.onclick = () => {
      if (this._dropdown?.style.display === 'none') {
        this._dropdown!.style.left = this._span!.offsetLeft + this._span!.offsetWidth / 2 - this._dropdown!.width / 2 + 'px';
        setTimeout(() => {
          this._dropdown!.style.display = 'block';
        });
      }
    };
    this.appendChild(this._span);
  }
}
