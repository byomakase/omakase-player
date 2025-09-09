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
      const rootNode = this.getRootNode();
      if (rootNode instanceof ShadowRoot) {
        this._dropdown = rootNode.getElementById(newValue) as OmakaseDropdown;
      } else {
        this._dropdown = document.getElementById(newValue) as OmakaseDropdown;
      }
      if (this._dropdown) {
        this._dropdown!.toggle = this;
      }
    }
  }

  connectedCallback() {
    if (!this.children.length) {
      this._span = document.createElement('span');
      this._span.classList.add('omakase-dropdown-toggle');
      this.appendChild(this._span);
    }
    this.onclick = (event) => {
      if (this.hasAttribute('disabled')) {
        event.stopPropagation();
        return;
      }
      if (this._dropdown?.style.display === 'none') {
        if (!this._dropdown!.style.right) {
          if (this._dropdown!.getAttribute('alignment') === 'center') {
            this._dropdown!.style.left = this.offsetLeft + this.offsetWidth / 2 - this._dropdown!.width / 2 + 'px';
          } else if (this._dropdown!.getAttribute('alignment') === 'right') {
            this._dropdown!.style.left = this.offsetLeft + this.offsetWidth - this._dropdown!.width + 'px';
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
