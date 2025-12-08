export class DomController {
  protected _domClasses = {
    player: 'omakase-player',
    playerWrapper: 'omakase-player-wrapper',
    playerDetached: 'omakase-player-detached',
    playerFullscreen: 'omakase-player-fullscreen',
    video: 'omakase-video',
    videoControls: 'omakase-video-controls',
    timecodeContainer: 'timecode-container',

    buttonOverlayPlay: 'omakase-button-play',
    buttonOverlayPause: 'omakase-button-pause',
    buttonOverlayLoading: 'omakase-button-loading',
    buttonOverlayError: 'omakase-button-error',
    buttonOverlayReplay: 'omakase-button-replay',
    buttonOverlayHelp: 'omakase-help-button',
    buttonOverlayAttach: 'omakase-overlay-button-attach',

    help: 'omakase-help',
    helpMenu: 'omakase-help-menu',

    sectionTopLeft: 'omakase-section-top-left',
    sectionTopRight: 'omakase-section-top-right',

    sectionBottomRight: 'omakase-section-bottom-right',
    buttonAttach: 'omakase-button-attach',
    buttonFullscreen: 'omakase-button-fullscreen',

    errorMessage: 'omakase-error-message',
    safeZoneWrapper: 'omakase-video-safe-zone-wrapper',
    safeZone: 'omakase-video-safe-zone',
    watermarkWrapper: 'omakase-watermark-wrapper',
    watermark: 'omakase-watermark',
    alerts: 'omakase-player-alerts',
    detachedBackground: 'omakase-detached-background',
    backgroundImage: 'omakase-background-image',
    backgroundLogo: 'omakase-background-logo',
    audioTextMenu: 'omakase-audio-text-menu',
    audioTextToggle: 'omakase-audio-text-toggle',
    audioTextDropdown: 'omakase-audio-text-dropdown',
    timecodeWrapper: 'omakase-timecode-wrapper',
    captions: 'omakase-captions',

    mediaChromeButton: 'media-chrome-button',
    mediaChromePlay: 'media-chrome-play',
    mediaChromePause: 'media-chrome-pause',
    mediaRewindButton: 'media-chrome-frame-backwards',
    mediaFastRewindButton: 'media-chrome-ten-frames-backwards',
    mediaForwardButton: 'media-chrome-frame-forward',
    mediaFastForwardButton: 'media-chrome-ten-frames-forward',
    mediaChromeFullscreenEnter: 'media-chrome-fullscreen-enter',
    mediaChromeFullscreenExit: 'media-chrome-fullscreen-exit',
    mediaChromeDetach: 'media-chrome-detach',
    mediaChromeAttach: 'media-chrome-attach',
    mediaChromeAudioMute: 'media-chrome-audio-mute',
    mediaChromeAudioLow: 'media-chrome-audio-low',
    mediaChromeAudioMedium: 'media-chrome-audio-medium',
    mediaChromeAudioHigh: 'media-chrome-audio-high',
    mediaChromeBitcDisabled: 'media-chrome-bitc-disabled',
    mediaChromeBitcEnabled: 'media-chrome-bitc-enabled',
    mediaChromeSettings: 'media-chrome-settings',
    mediaChromeAudioText: 'media-chrome-audio-text',
    mediaChromeAudio: 'media-chrome-audio',
    mediaChromeBitcTooltip: 'media-chrome-bitc-tooltip',
    mediaChromeCurrentTimecode: 'media-chrome-current-timecode',
    mediaChromeTimeDuration: 'media-chrome-time-duration',
    mediaChromePreviewTimecode: 'media-chrome-preview-timecode',
    mediaChromePreviewThumbnail: 'media-chrome-preview-thumbnail',
    mediaChromePreviewWrapper: 'media-chrome-preview-wrapper',
    mediaChromeTextOn: 'media-chrome-text-on',
    mediaChromeTextOff: 'media-chrome-text-off',
    mediaChromeHelp: 'media-chrome-help',
    mediaChromeTrackselector: 'media-chrome-trackselector',
    mediaChromeControlBarToggle: 'media-chrome-control-bar-toggle',
    mediaChromeClose: 'media-chrome-close',
    mediaControlBar: 'media-control-bar',
    omakaseControlBar: 'omakase-control-bar',
  };

  showElements(...element: Array<HTMLElement | undefined>): DomController {
    element.forEach((element) => {
      if (!element) {
        return;
      }
      element.classList.remove('d-none');
    });
    return this;
  }

  isShown(element: HTMLElement) {
    return !element.classList.contains('d-none');
  }

  hideElements(...element: Array<HTMLElement | undefined>): DomController {
    element.forEach((element) => {
      if (!element) {
        return;
      }
      element.classList.add('d-none');
    });
    return this;
  }
}
