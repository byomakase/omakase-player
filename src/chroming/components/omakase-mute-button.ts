import {MediaChromeButton} from 'media-chrome';
import {filter, takeUntil} from 'rxjs';
import {getPlayerAudioApi, type PlayerApi, type PlayerDetachedApi} from '../../player/player-api';
import type {PlayerAudioCommonApi} from '../../player/player-audio-api';
import {PlayerAudioType} from '../../player/player-audio';
import {ObserverBreaker} from '../../common/observer-breaker';
import {DomUtil} from '../../dom/dom-util';
import {PlayerEventType} from '../../player/player-event';
import {AUDIO_DEFAULTS} from '../../constants';
import type {OmakaseVolumeRange} from './omakase-volume-range';
import {ControlBarComponent, ControlBarComponentAttributes} from '../../control-bar/control-bar-component';

const volumeLevelProperty = 'omakaseVolumeLevel';

export const OmakaseMuteButtonAttributes = {
  VOLUME_FLYOUT: 'volume-flyout',
};

export const OmakaseMuteButtonSlots = {
  VOLUME: 'volume',
};

export type OmakaseVolumeFlyoutDirection = 'left' | 'right' | 'up' | 'down';

const volumeFlyoutDirections: OmakaseVolumeFlyoutDirection[] = ['left', 'right', 'up', 'down'];

function getSlotTemplateHTML(_attrs: Record<string, string>) {
  return `
  <style>
  ${/* Default to High slot/icon. */ ''}
  :host(:not([${volumeLevelProperty}])) slot[name=icon] slot:not([name=high]), 
  :host([${volumeLevelProperty}=high]) slot[name=icon] slot:not([name=high]) {
    display: none !important;
  }

  :host([${volumeLevelProperty}=off]) slot[name=icon] slot:not([name=off]) {
    display: none !important;
  }

  :host([${volumeLevelProperty}=low]) slot[name=icon] slot:not([name=low]) {
    display: none !important;
  }

  :host([${volumeLevelProperty}=medium]) slot[name=icon] slot:not([name=medium]) {
    display: none !important;
  }

  :host(:not([${volumeLevelProperty}=off])) slot[name=tooltip-unmute],
  :host([${volumeLevelProperty}=off]) slot[name=tooltip-mute] {
    display: none;
  }

  .media-chrome-audio-icon {
    width: 100%;
    height: 100%;
    padding: 2px;
    box-sizing: border-box;
    background-origin: content-box;
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
  }

 .media-chrome-audio-mute {
    background-image: url("data:image/svg+xml,%3csvg%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M5.97%2016.45L11.47%2021.01C11.64%2021.15%2011.88%2021.18%2012.07%2021.09C12.27%2021%2012.4%2020.8%2012.4%2020.58V10.03L5.97%2016.46V16.45Z'%20fill='%23FFFFFF'/%3e%3cpath%20d='M4.47%2015.21L12.4%207.28V3.7C12.4%203.48%2012.27%203.28%2012.07%203.19C11.87%203.1%2011.64%203.13%2011.47%203.27L4.45%209.09H0.57C0.26%209.09%200%209.34%200%209.66V14.64C0%2014.95%200.25%2015.21%200.57%2015.21H4.47Z'%20fill='%23FFFFFF'/%3e%3c/svg%3e");
  }
 .media-chrome-audio-low {
    background-image: url("data:image/svg+xml,%3csvg%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M12.07%203.19C11.87%203.1%2011.64%203.13%2011.47%203.27L4.45%209.09H0.57C0.26%209.09%200%209.34%200%209.66V14.64C0%2014.95%200.25%2015.21%200.57%2015.21H4.45L11.47%2021.02C11.64%2021.16%2011.88%2021.19%2012.07%2021.1C12.27%2021.01%2012.4%2020.81%2012.4%2020.59V3.7C12.4%203.48%2012.27%203.28%2012.07%203.19Z'%20fill='%23FFFFFF'/%3e%3c/svg%3e");
  }
 .media-chrome-audio-medium {
    background-image: url("data:image/svg+xml,%3csvg%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M12.07%203.19C11.87%203.1%2011.64%203.13%2011.47%203.27L4.45%209.09H0.57C0.26%209.09%200%209.34%200%209.66V14.64C0%2014.95%200.25%2015.21%200.57%2015.21H4.45L11.47%2021.02C11.64%2021.16%2011.88%2021.19%2012.07%2021.1C12.27%2021.01%2012.4%2020.81%2012.4%2020.59V3.7C12.4%203.48%2012.27%203.28%2012.07%203.19Z'%20fill='%23FFFFFF'/%3e%3cpath%20d='M17.38%2017.58C18.56%2016%2019.19%2014.12%2019.19%2012.14C19.19%2010.02%2018.48%208.03%2017.14%206.39C17.04%206.27%2016.9%206.19%2016.74%206.19H16.7C16.52%206.19%2016.39%206.28%2016.32%206.35L16.16%206.51C15.96%206.71%2015.94%207.03%2016.12%207.25C17.25%208.65%2017.85%2010.34%2017.85%2012.14C17.85%2013.82%2017.32%2015.41%2016.32%2016.76C16.16%2016.98%2016.18%2017.29%2016.37%2017.48L16.53%2017.64C16.63%2017.74%2016.77%2017.8%2016.92%2017.8L17.01%2018.46L16.96%2017.79C17.12%2017.78%2017.27%2017.7%2017.36%2017.57L17.38%2017.58Z'%20fill='%23FFFFFF'/%3e%3c/svg%3e");
  }
 .media-chrome-audio-high {
    background-image: url("data:image/svg+xml,%3csvg%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cg%20clip-path='url(%23clip0_970_386)'%3e%3cpath%20d='M23.75%2012.14C23.75%208.47%2022.41%204.93%2019.97%202.19C19.87%202.08%2019.72%202.01%2019.57%202.01H19.55C19.4%202.01%2019.27%202.06%2019.16%202.17L19%202.33C18.8%202.53%2018.79%202.87%2018.98%203.09C21.19%205.59%2022.41%208.8%2022.41%2012.15C22.41%2015.5%2021.27%2018.49%2019.2%2020.94C19.02%2021.16%2019.03%2021.48%2019.23%2021.68L19.39%2021.84C19.49%2021.94%2019.63%2022%2019.78%2022C19.96%2022%2020.1%2021.92%2020.2%2021.8C22.48%2019.1%2023.73%2015.67%2023.73%2012.13L23.75%2012.14Z'%20fill='%23FFFFFF'/%3e%3cpath%20d='M12.07%203.19C11.87%203.1%2011.64%203.13%2011.47%203.27L4.45%209.09H0.57C0.26%209.09%200%209.34%200%209.66V14.64C0%2014.95%200.25%2015.21%200.57%2015.21H4.45L11.47%2021.02C11.64%2021.16%2011.88%2021.19%2012.07%2021.1C12.27%2021.01%2012.4%2020.81%2012.4%2020.59V3.7C12.4%203.48%2012.27%203.28%2012.07%203.19Z'%20fill='%23FFFFFF'/%3e%3cpath%20d='M17.38%2017.58C18.56%2016%2019.19%2014.12%2019.19%2012.14C19.19%2010.02%2018.48%208.03%2017.14%206.39C17.04%206.27%2016.9%206.19%2016.74%206.19H16.7C16.52%206.19%2016.39%206.28%2016.32%206.35L16.16%206.51C15.96%206.71%2015.94%207.03%2016.12%207.25C17.25%208.65%2017.85%2010.34%2017.85%2012.14C17.85%2013.82%2017.32%2015.41%2016.32%2016.76C16.16%2016.98%2016.18%2017.29%2016.37%2017.48L16.53%2017.64C16.63%2017.74%2016.77%2017.8%2016.92%2017.8L17.01%2018.46L16.96%2017.79C17.12%2017.78%2017.27%2017.7%2017.36%2017.57L17.38%2017.58Z'%20fill='%23FFFFFF'/%3e%3c/g%3e%3cdefs%3e%3cclipPath%20id='clip0_970_386'%3e%3crect%20width='23.75'%20height='20'%20fill='white'%20transform='translate(0%202)'/%3e%3c/clipPath%3e%3c/defs%3e%3c/svg%3e");
  }

  ${/* Volume flyout: a panel with the slotted omakase-volume-range, shown next to the button while it's hovered, unless it's disabled. */ ''}
  .volume-flyout,
  .volume-flyout-bridge {
    display: none;
    position: absolute;
    z-index: 10;
  }

  .volume-flyout {
    align-items: center;
    justify-content: center;
    box-sizing: content-box;
    background: var(--omakase-volume-flyout-background-color, var(--_omakase-volume-flyout-background-color-default, transparent));
    border: var(--omakase-volume-flyout-border, var(--_omakase-volume-flyout-border-default, none));
    border-radius: var(--omakase-volume-flyout-border-radius, var(--_omakase-volume-flyout-border-radius-default, 0));
    padding: var(--omakase-volume-flyout-padding, var(--_omakase-volume-flyout-padding-default, 0));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}]:hover:not([disabled])) .volume-flyout {
    display: flex;
  }

  ${
    /* Keep the button hovered while the pointer crosses the gap between it and the panel: one bridge as wide as
     the button, and one as wide as the panel. */ ''
  }
  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}]:hover:not([disabled])) .volume-flyout-bridge,
  .volume-flyout::before {
    display: block;
    content: '';
    position: absolute;
  }

  ${/* The flyout takes the tooltip's place while it's shown. */ ''}
  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}]:hover:not([disabled])) slot[name=tooltip] {
    display: none;
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=right]) .volume-flyout {
    left: calc(100% + var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px)));
    top: 50%;
    transform: translateY(-50%);
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=left]) .volume-flyout {
    right: calc(100% + var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px)));
    top: 50%;
    transform: translateY(-50%);
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=up]) .volume-flyout,
  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=down]) .volume-flyout {
    left: 50%;
    transform: translateX(-50%);
    width: var(--omakase-volume-flyout-thickness, var(--media-control-height, 24px));
    height: var(--omakase-volume-flyout-length, 70px);
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=up]) .volume-flyout {
    bottom: calc(100% + var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px)));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=down]) .volume-flyout {
    top: calc(100% + var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px)));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=right]) .volume-flyout-bridge {
    top: 0;
    bottom: 0;
    left: 100%;
    width: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=right]) .volume-flyout::before {
    top: 0;
    bottom: 0;
    right: 100%;
    width: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=left]) .volume-flyout-bridge {
    top: 0;
    bottom: 0;
    right: 100%;
    width: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=left]) .volume-flyout::before {
    top: 0;
    bottom: 0;
    left: 100%;
    width: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=up]) .volume-flyout-bridge {
    left: 0;
    right: 0;
    bottom: 100%;
    height: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=up]) .volume-flyout::before {
    left: 0;
    right: 0;
    top: 100%;
    height: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=down]) .volume-flyout-bridge {
    left: 0;
    right: 0;
    top: 100%;
    height: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=down]) .volume-flyout::before {
    left: 0;
    right: 0;
    bottom: 100%;
    height: var(--omakase-volume-flyout-offset, var(--_omakase-volume-flyout-offset-default, 0px));
  }

  ::slotted(omakase-volume-range) {
    flex: none;
    width: var(--omakase-volume-flyout-length, 70px);
    height: var(--omakase-volume-flyout-thickness, var(--media-control-height, 24px));
    cursor: auto;
  }

  ${/* Vertical: the range keeps its horizontal layout box, rotated so that the maximum is at the top. */ ''}
  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=up]) ::slotted(omakase-volume-range),
  :host([${OmakaseMuteButtonAttributes.VOLUME_FLYOUT}=down]) ::slotted(omakase-volume-range) {
    transform: rotate(-90deg);
  }
  </style>

  <slot name="icon">
    <slot name="off"><div class="media-chrome-audio-icon media-chrome-audio-mute"></div></slot>
    <slot name="low"><div class="media-chrome-audio-icon media-chrome-audio-low"></div></slot>
    <slot name="medium"><div class="media-chrome-audio-icon media-chrome-audio-medium"></div></slot>
    <slot name="high"><div class="media-chrome-audio-icon media-chrome-audio-high"></div></slot>
  </slot>
  <div class="volume-flyout-bridge"></div>
  <div class="volume-flyout" part="volume-flyout"><slot name="${OmakaseMuteButtonSlots.VOLUME}"></slot></div>
`;
}

function getTooltipContentHTML() {
  return `
  <slot name="tooltip-mute">Mute</slot>
  <slot name="tooltip-unmute">Unmute</slot>
`;
}

export class OmakaseMuteButton extends ControlBarComponent(MediaChromeButton) {
  static getSlotTemplateHTML = getSlotTemplateHTML;
  static getTooltipContentHTML = getTooltipContentHTML;

  static override get observedAttributes() {
    return [...super.observedAttributes, OmakaseMuteButtonAttributes.VOLUME_FLYOUT];
  }

  private _player: PlayerApi | PlayerDetachedApi | undefined;
  private _audio: PlayerAudioCommonApi | undefined;
  private _volumeRange: OmakaseVolumeRange | undefined;
  protected _playerBreaker = new ObserverBreaker();
  protected _destroyBreaker = new ObserverBreaker();

  get player() {
    return this._player;
  }

  set player(player: PlayerApi | PlayerDetachedApi | undefined) {
    this._player = player;
    this._audio = player ? getPlayerAudioApi(player) : undefined;
    if (this._volumeRange) {
      this._volumeRange.player = player;
    }
    this._playerBreaker.break();
    if (this._player) {
      this.setVolumeLevel(this.getMuted(), this.getVolume());
      this._player.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_AUDIO_CHANGE),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: (event) => {
            this.setVolumeLevel(this.getMuted(), this.getVolume());
          },
        });
    }
  }

  /** Side of the button the volume range is presented on, if any. */
  get volumeFlyout(): OmakaseVolumeFlyoutDirection | undefined {
    const direction = this.getAttribute(OmakaseMuteButtonAttributes.VOLUME_FLYOUT) as OmakaseVolumeFlyoutDirection | null;
    return direction && volumeFlyoutDirections.includes(direction) ? direction : undefined;
  }

  set volumeFlyout(direction: OmakaseVolumeFlyoutDirection | undefined) {
    DomUtil.setAttribute(this, OmakaseMuteButtonAttributes.VOLUME_FLYOUT, direction);
  }

  /** The volume range presented by the volume flyout. */
  get volumeRange(): OmakaseVolumeRange | undefined {
    return this._volumeRange;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.createVolumeRange();
  }

  override attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(attrName, oldValue, newValue);
    if (attrName === OmakaseMuteButtonAttributes.VOLUME_FLYOUT && this.isConnected) {
      this.createVolumeRange();
    } else if (attrName === ControlBarComponentAttributes.DISABLED) {
      this._volumeRange?.toggleAttribute('disabled', !this.enabled);
    }
  }

  private createVolumeRange() {
    if (!this.volumeFlyout || this._volumeRange) {
      return;
    }
    let volumeRange = this.querySelector<OmakaseVolumeRange>(`:scope > omakase-volume-range`);
    if (!volumeRange) {
      volumeRange = document.createElement('omakase-volume-range') as OmakaseVolumeRange;
      this.appendChild(volumeRange);
    }
    // make sure the player setter below is the element's own, and not shadowed by a plain property
    globalThis.customElements.upgrade(volumeRange);
    volumeRange.slot = OmakaseMuteButtonSlots.VOLUME;
    // the flyout follows the button: it's disabled while the button is
    volumeRange.toggleAttribute('disabled', !this.enabled);
    this._volumeRange = volumeRange;
    if (this._player) {
      volumeRange.player = this._player;
    }
  }

  private getMuted(): boolean {
    return this._audio?.getHandler(PlayerAudioType.OUTPUT)?.muted ?? AUDIO_DEFAULTS.muted;
  }

  private getVolume(): number {
    return this._audio?.getHandler(PlayerAudioType.OUTPUT)?.volume ?? AUDIO_DEFAULTS.volume;
  }

  /**
   * @type {string | undefined}
   */
  get volumeLevel(): string | undefined {
    return DomUtil.getAttribute(this, volumeLevelProperty);
  }

  set volumeLevel(value: string | undefined) {
    DomUtil.setAttribute(this, volumeLevelProperty, value);
  }

  setVolumeLevel(isMuted: boolean, volume: number) {
    if (isMuted || volume === 0) {
      this.volumeLevel = 'off';
    } else if (volume < 0.2) {
      this.volumeLevel = 'low';
    } else if (volume < 0.8) {
      this.volumeLevel = 'medium';
    } else {
      this.volumeLevel = 'high';
    }
    this.updateAriaLabel();
  }

  override handleClick(event?: Event): void {
    // clicks and key presses on the volume flyout bubble up to the button, but aren't meant for it
    const flyout = this.shadowRoot?.querySelectorAll('.volume-flyout, .volume-flyout-bridge');
    if (event?.composedPath().some((target) => target === this._volumeRange || Array.from(flyout ?? []).includes(target as Element))) {
      return;
    }
    if (this._audio) {
      this._audio.setMuted(!this.getMuted());
    }
    this.blur();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyBreaker.destroy();
  }

  private updateAriaLabel = () => {
    const muted = this.volumeLevel === 'off';
    const label = muted ? 'unmute' : 'mute';
    this.setAttribute('aria-label', label);
  };
}
