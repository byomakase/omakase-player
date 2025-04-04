import {Destroyable, OmakaseVttCue} from '../types';
import {catchError, map, Observable, of, Subject, take} from 'rxjs';
import {nullifier} from '../util/destroy-util';
import {VttLoadOptions} from '../api/vtt-aware-api';
import {OmakaseVttFile} from '../vtt';

export interface VttFileFactory<T extends OmakaseVttFile<OmakaseVttCue>> {
  create(url: string, options: VttLoadOptions): Observable<T>;
}

export interface VttAdapterConfig<T extends OmakaseVttFile<OmakaseVttCue>> {
  vttUrl?: string;
  vttFile?: T;
}

export class VttAdapter<T extends OmakaseVttFile<OmakaseVttCue>> implements Destroyable {
  readonly vttFileLoaded$: Subject<T> = new Subject<T>();

  private _vttUrl?: string;
  private _vttFile?: T;
  private _vttFactory: VttFileFactory<T>;

  constructor(vttFactory: VttFileFactory<T>) {
    this._vttFactory = vttFactory;
  }

  get vttUrl(): string | undefined {
    return this._vttUrl;
  }

  get vttFile(): T | undefined {
    return this._vttFile;
  }

  set vttUrl(vttUrl: string | undefined) {
    this._vttUrl = vttUrl;
  }

  set vttFile(vttFile: T | undefined) {
    this._vttFile = vttFile;
  }

  initFromConfig(config: VttAdapterConfig<T>) {
    this._vttUrl = config.vttUrl;
    this._vttFile = config.vttFile;
  }

  loadVtt(vttUrl: string, options: VttLoadOptions): Observable<T | undefined> {
    this._vttUrl = vttUrl;
    return this.fetchVttFile(this._vttUrl, options).pipe(take(1));
  }

  private fetchVttFile(vttUrl: string, options: VttLoadOptions): Observable<T | undefined> {
    return this._vttFactory.create(vttUrl, options).pipe(
      map((vttFile: T) => {
        this._vttFile = vttFile;
        this.vttFileLoaded$.next(this._vttFile);
        return vttFile;
      }),
      catchError((err, caught) => {
        return of(void 0);
      })
    );
  }

  destroy() {
    nullifier(this._vttFile);
  }
}
