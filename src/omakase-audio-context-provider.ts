/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {Destroyable} from './common/capabilities';
import {filter, Observable, Subject, take, takeUntil} from 'rxjs';
import {freeObserver, nextCompleteObserver, passiveObservable} from './util/rxjs-util';
import {DomAudioElement} from './dom/dom-media-element';
import {DomElementEventType} from './dom/dom-element';
import {BlobUtil} from './util/blob-util';
import {UrlSource} from './source';
import {UrlUtil} from './util/url-util';
import {ObserverBreaker} from './common/observer-breaker';
import {WorkerUtil} from './worker/worker-util';

// @ts-ignore
import syncProcessor from './worker/sync-audio-worklet-processor?raw'; // @ts-ignore
import silentWavBase64 from './../assets/silent.wav.base64.txt?raw';

export class OmakaseAudioContextProvider implements Destroyable {
  private static _instance: OmakaseAudioContextProvider | undefined;

  static get instance(): OmakaseAudioContextProvider {
    return (this._instance ??= new OmakaseAudioContextProvider());
  }

  /** Static accessor so the audio subsystem can reach the shared AudioContext. */
  static get audioContext(): AudioContext {
    return this.instance.audioContext;
  }

  private readonly _onSyncTick$: Subject<{}> = new Subject<{}>();

  private _audioContext: AudioContext;

  /**
   * Time synchronization worklet
   * @protected
   */
  private _syncWorklet?: AudioWorkletNode;
  private _syncWorkletSource?: MediaElementAudioSourceNode;
  private _syncWorkletGain?: GainNode;

  protected _destroyBreaker = new ObserverBreaker();

  private constructor() {
    this._audioContext = new AudioContext();
    console.debug(`AudioContext created`);

    try {
      this._audioContext.resume().then((event) => {
        console.debug('AudioContext resumed');
      })
    } catch (e) {
      console.debug(`AudioContext resume failed: ${e}. We will try again on play()`);
    }

    this.createSyncWorklet();
  }

  protected createSyncWorklet(): void {
    if (this._syncWorklet) {
      console.debug('syncWorklet already exists');
    } else {
      new Observable<AudioWorkletNode>((observer) => {
        let domAudioElement = new DomAudioElement({loop: true});
        domAudioElement.onEvent$
          .pipe(filter((p) => p.type === DomElementEventType.DOM_ELEMENT_LOADED))
          .pipe(
            filter((p) => !!p),
            take(1)
          )
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (syncWorkletAudioElement) => {
              this._syncWorkletSource = this._audioContext.createMediaElementSource(domAudioElement.htmlElement);
              const workletName = 'sync-audio-worklet-processor';
              try {
                let audioWorkletNode = new AudioWorkletNode(this._syncWorkletSource.context, workletName, {
                  parameterData: {},
                });
                nextCompleteObserver(observer, audioWorkletNode);
              } catch (e) {
                let objectURL = BlobUtil.createObjectURL(BlobUtil.createBlob([syncProcessor], {type: 'application/javascript'}));
                this._syncWorkletSource.context.audioWorklet.addModule(objectURL).then(() => {
                  let audioWorkletNode = new AudioWorkletNode(this._syncWorkletSource!.context, workletName, {
                    parameterData: {},
                  });
                  nextCompleteObserver(observer, audioWorkletNode);
                });
              }
            },
          });

        domAudioElement.loadSource(UrlSource.of(UrlUtil.formatBase64Url('audio/wav', silentWavBase64))).subscribe()
      }).subscribe((audioWorkletNode) => {
        this._syncWorklet = audioWorkletNode;
        this._syncWorklet.port.onmessage = (event: MessageEvent) => {
          this._onSyncTick$.next({});
        };

        this._syncWorkletSource!.connect(this._syncWorklet).connect(this._syncWorkletSource!.context.destination);

        this._syncWorkletGain = this._audioContext.createGain();
        this._syncWorkletGain.gain.value = 0; // Set gain to 0 (silent)
        this._syncWorkletGain.connect(this._syncWorkletSource!.context.destination);

        this._syncWorkletSource!.connect(this._syncWorkletGain);
      });
    }
  }

  tryResumeAudioContext(): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.isAudioContextRunning) {
        // console.debug('AudioContext running');
        nextCompleteObserver(observer);
      } else {
        console.debug('AudioContext resuming..');
        this._audioContext?.resume().then((event) => {
          console.debug('AudioContext resumed');
          nextCompleteObserver(observer);
        });
      }
    });
  }

  get audioContext(): AudioContext {
    return this._audioContext;
  }

  get isAudioContextRunning(): boolean {
    return this._audioContext.state === 'running';
  }

  get onSyncTick$(): Observable<{}> {
    return this._onSyncTick$.asObservable();
  }

  destroy() {
    freeObserver(this._onSyncTick$);

    if (this._audioContext && this._audioContext.state === 'running') {
      this._audioContext.close().then(() => {
        console.debug(`AudioContext closed`);
      });
    }
    // @ts-ignore
    this._audioContext = void 0;

    this._syncWorkletSource?.disconnect();
    this._syncWorkletGain?.disconnect();
    // @ts-ignore
    this._syncWorkletSource = void 0;

    if (this._syncWorklet) {
      WorkerUtil.dispose(this._syncWorklet);
      // @ts-ignore
      this._syncWorklet = void 0;
    }

    this._destroyBreaker.destroy();

    if (OmakaseAudioContextProvider._instance === this) {
      OmakaseAudioContextProvider._instance = void 0;
    }
  }
}
