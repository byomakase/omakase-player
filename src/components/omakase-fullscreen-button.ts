import {MediaFullscreenButton} from 'media-chrome';

export class OmakaseFullscreenButton extends MediaFullscreenButton {
  override handleClick(): void {
    super.handleClick();
    this.blur();
  }
}
