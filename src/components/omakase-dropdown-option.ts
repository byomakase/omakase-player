export class OmakaseDropdownOption extends HTMLElement {
  value?: any;

  constructor() {
    super();
  }

  connectedCallback() {
    const text = this.innerText;
    this.innerText = '';
    const iconElement = document.createElement('i');
    iconElement.classList.add('omakase-dropdown-option-icon');
    const textElement = document.createElement('span');
    textElement.innerText = text;
    textElement.classList.add('omakase-dropdown-option-text');
    this.appendChild(iconElement);
    this.appendChild(textElement);
  }
}
