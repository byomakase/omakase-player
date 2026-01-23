import {Observable, Subject, takeUntil} from 'rxjs';
import {AlertsApi, MarkerTrackApi} from '../api';
import {ChromingApi} from '../api/chroming-api';
import {TimeRangeMarkerTrackApi} from '../api/time-range-marker-track-api';
import {MarkerTrackConfig, VideoSafeZone} from '../video/model';
import {VideoDomControllerApi} from '../video/video-dom-controller-api';
import {PlayerChromingTheme} from './model';
import {PlayerChromingDomControllerApi} from './player-chroming-dom-controller-api';
import {nextCompleteObserver, nextCompleteSubject} from '../util/rxjs-util';
import {HelpMenuGroup} from '../types';
import {VideoControllerApi} from '../video';

export class PlayerChromingController implements ChromingApi {
  private _playerChromingDomController: PlayerChromingDomControllerApi;
  private _videoController: VideoControllerApi;
  private _videoDomController: VideoDomControllerApi;
  private _alertsController: AlertsApi;
  private _destroyed$ = new Subject<void>();

  get alerts(): AlertsApi {
    return this._alertsController;
  }

  get progressMarkerTrack(): TimeRangeMarkerTrackApi | undefined {
    return this._playerChromingDomController.getProgressMarkerTrack();
  }

  constructor(videoController: VideoControllerApi, videoDomController: VideoDomControllerApi, alertsController: AlertsApi) {
    this._videoController = videoController;
    this._videoDomController = videoDomController;
    this._playerChromingDomController = videoDomController.playerChromingDomController;
    this._alertsController = alertsController;
  }

  setThumbnailVttUrl(thumbnailVttUrl: string) {
    this._playerChromingDomController.loadThumbnailVtt(thumbnailVttUrl);
  }

  setWatermark(watermark: string) {
    this._videoDomController.setWatermark(watermark);
  }

  getPlayerChromingElement<T>(querySelector: string): T {
    return this._videoDomController.getPlayerChromingElement(querySelector);
  }

  createMarkerTrack(config: MarkerTrackConfig): Observable<MarkerTrackApi> {
    return new Observable<MarkerTrackApi>((observer) => {
      const markerTrack = this._videoDomController.createMarkerTrack(config);

      if (config.vttUrl) {
        markerTrack.onVttLoaded$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
          nextCompleteObserver(observer, markerTrack);
        });
      } else {
        // timeout is here to make sure the marker track element is created in the dom
        setTimeout(() => {
          nextCompleteObserver(observer, markerTrack);
        });
      }
    });
  }

  appendHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return this._videoController.appendHelpMenuGroup(helpMenuGroup);
  }

  prependHelpMenuGroup(helpMenuGroup: HelpMenuGroup): Observable<void> {
    return this._videoController.prependHelpMenuGroup(helpMenuGroup);
  }

  clearHelpMenuGroups(): Observable<void> {
    return this._videoController.clearHelpMenuGroups();
  }

  getHelpMenuGroups(): HelpMenuGroup[] {
    return this._videoController.getHelpMenuGroups();
  }

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone> {
    return this._videoDomController.addSafeZone(videoSafeZone);
  }

  removeSafeZone(id: string) {
    return this._videoDomController.removeSafeZone(id);
  }

  clearSafeZones(): Observable<void> {
    return this._videoDomController.clearSafeZones();
  }

  getSafeZones(): VideoSafeZone[] {
    return this._videoDomController.getSafeZones();
  }

  setFloatingTimeVisible(visible: boolean): void {
    const theme = this._playerChromingDomController.playerChroming.theme;
    if (theme === PlayerChromingTheme.Default || theme === PlayerChromingTheme.Omakase || theme === PlayerChromingTheme.Stamp || theme === PlayerChromingTheme.Chromeless) {
      const floatingControls = this._playerChromingDomController.playerChroming.themeConfig?.floatingControls as string[];
      if (visible && floatingControls && !floatingControls.includes('TIME')) {
        floatingControls.push('TIME');
        this._playerChromingDomController.updateBitc();
      } else if (!visible && floatingControls && floatingControls.includes('TIME')) {
        floatingControls.splice(floatingControls.indexOf('TIME'), 1);
        this._playerChromingDomController.updateBitc();
      }
    } else {
      throw new Error(`Current theme doesn't support invoked method`);
    }
  }
  isFloatingTimeVisible(): boolean | undefined {
    const theme = this._playerChromingDomController.playerChroming.theme;
    if (theme === PlayerChromingTheme.Default || theme === PlayerChromingTheme.Omakase || theme === PlayerChromingTheme.Stamp || theme === PlayerChromingTheme.Chromeless) {
      return (this._playerChromingDomController.playerChroming.themeConfig?.floatingControls as string[])?.includes('TIME');
    } else {
      return undefined;
    }
  }

  destroy() {
    nextCompleteSubject(this._destroyed$);
  }
}
