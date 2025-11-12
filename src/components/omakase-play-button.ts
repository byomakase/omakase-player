import {MediaPlayButton} from 'media-chrome';
import {VideoControllerApi} from '../video';

export class OmakasePlayButton extends MediaPlayButton {
  private _videoController?: VideoControllerApi;

  get videoController() {
    return this._videoController;
  }

  set videoController(videoController: VideoControllerApi | undefined) {
    this._videoController = videoController;
  }

  override handleClick(): void {
    if (this._videoController) {
      this._videoController.togglePlayPause();
    } else {
      super.handleClick();
    }
    this.blur();
  }
}
