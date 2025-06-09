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
      if (this._dropdown) {
        this._dropdown!.toggle = this;
      }
    }
  }

  connectedCallback() {
    let innerElement: any;
    if (this.children[0]) {
      innerElement = this.children[0] as HTMLElement;
    } else {
      this._span = document.createElement('span');
      this._span.classList.add('omakase-dropdown-toggle');
      this.appendChild(this._span);
      innerElement = this._span;
    }
    innerElement.onclick = () => {
      if (this._dropdown?.style.display === 'none') {
        if (!this._dropdown!.style.right) {
          if (this._dropdown!.getAttribute('align') === 'center') {
            this._dropdown!.style.left = this.offsetLeft + innerElement.offsetWidth / 2 - this._dropdown!.width / 2 + 'px';
          } else {
            this._dropdown!.style.left = this.offsetLeft + 'px';
          }
        }
        setTimeout(() => {
          this._dropdown!.style.display = 'flex';
          this.classList.add('active');
        });
      } else {
        this._dropdown!.style.display = 'none';
        this.classList.remove('active');
      }
    };
  }
}
