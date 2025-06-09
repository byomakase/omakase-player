import {OmakaseDropdownToggle} from './omakase-dropdown-toggle';
import {OmakaseDropdownList} from './omakase-dropdown-list';

export class OmakaseDropdown extends HTMLElement {
  private _toggle?: OmakaseDropdownToggle;

  constructor() {
    super();
  }

  get width(): number {
    const lists = this.querySelectorAll('omakase-dropdown-list') as NodeListOf<OmakaseDropdownList>;
    let width = 0;
    lists.forEach((list) => {
      width += list.width;
    });
    return width;
  }

  get toggle(): OmakaseDropdownToggle | undefined {
    return this._toggle;
  }

  set toggle(toggle: OmakaseDropdownToggle | undefined) {
    this._toggle = toggle;
  }

  connectedCallback() {
    const lists = this.querySelectorAll('omakase-dropdown-list') as NodeListOf<OmakaseDropdownList>;

    if (this.getAttribute('floating')) {
      const closeButton = document.createElement('span');
      closeButton.classList.add('omakase-dropdown-close');
      closeButton.onclick = () => {
        this.closeDropdown();
      };
      lists[lists.length - 1].appendChild(closeButton);
    } else {
      setTimeout(() => {
        lists.forEach((list) => {
          list.selectedOption$.subscribe((option) => {
            this.closeDropdown();
            if (this._toggle?.span) {
              this._toggle.span.innerText = option?.label ?? '';
            }
          });
        });
      });
      document.addEventListener('click', (event) => {
        if (!this.contains(event.target as Node)) {
          this.closeDropdown();
        }
      });
    }
  }

  private closeDropdown() {
    this.style.display = 'none';
    if (this._toggle) {
      this._toggle.classList.remove('active');
    }
  }
}
