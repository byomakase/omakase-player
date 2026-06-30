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

import {combineLatest, filter, forkJoin, Observable, Subject, take, takeUntil} from 'rxjs';
import {Validators} from '../common/validators';
import type {Destroyable, Serializable} from '../common/capabilities';
import {
  emptyPassiveObservable,
  errorCompleteObserver,
  freeObserver,
  nextCompleteObserver,
  passiveObservable
} from '../util/rxjs-util';
import {ObserverBreaker} from '../common/observer-breaker';
import {AUDIO_DEFAULTS} from '../constants';
import {
  AudioPeakProcessor,
  type AudioPeakProcessorApi,
  type AudioPeakProcessorEvent,
  AudioPeakProcessorMeterStandard,
  type AudioPeakProcessorState
} from './audio-peak-processor';
import {AudioRouter, type AudioRouterApi, AudioRouterEventType, type AudioRouterState} from './audio-router';
import {isNullOrUndefined} from '../util/util-functions';
import type {
  AudioEffectFilter,
  AudioEffectGraphConnection,
  AudioEffectGraphSpecificConnection,
  AudioEffectGraphState,
  AudioEffectParam,
  AudioEffectState
} from './audio-effects';
import {
  type AudioEffectEvent,
  AudioEffectEventType,
  AudioEffectGraph,
  type AudioEffectParameterChange,
  type AudioEffectsApi
} from './audio-effects';
import {OmpError} from '../types';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';

export interface AudioSlot {
  input: AudioNode;
  output: AudioNode;
  isAttaching: boolean;
  effectGraph?: AudioEffectGraph | undefined;
}

export type AudioSlotType = 'source' | 'router' | 'destination';

export interface AudioHandlerSlotState {
  type: AudioSlotType;
  effectGraph: AudioEffectGraphState;
}

export enum AudioHandlerEventType {
  AUDIO_HANDLER_CHANGE = 'AUDIO_HANDLER_CHANGE',
}

export interface AudioHandlerEventData extends Serializable {
  state: AudioHandlerState;
}

export type AudioHandlerEventTypeDataMap = {
  [AudioHandlerEventType.AUDIO_HANDLER_CHANGE]: AudioHandlerEventData;
};

export type AudioHandlerEvent = {
  [K in AudioHandlerEventType]: {
    type: K;
    data: AudioHandlerEventTypeDataMap[K];
  };
}[keyof AudioHandlerEventTypeDataMap];

export interface AudioHandlerState {
  enabled: boolean;
  channelCount: number;

  volume: number;
  muted: boolean;

  peakProcessor: AudioPeakProcessorState | undefined;

  router: AudioRouterState | undefined;

  slots: AudioHandlerSlotState[];
}

export interface AudioHandlerApi {
  onEvent$: Observable<AudioHandlerEvent>;

  onPeakProcessorEvent$: Observable<AudioPeakProcessorEvent>;

  enabled: boolean;

  inputAudioNode: AudioNode;

  outputAudioNode: AudioNode;

  channelCount: number;

  volume: number;

  muted: boolean;

  state: AudioHandlerState;

  effects: AudioEffectsApi;

  router: AudioRouterApi | undefined;

  mute(): Observable<void>;

  unmute(): Observable<void>;

  toggleMuted(): Observable<void>;

  setMuted(muted: boolean): Observable<void>;

  setVolume(volume: number): Observable<void>;

  setEnabled(enabled: boolean): Observable<void>;

  createPeakProcessor(): Observable<void>;
  createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void>;

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<AudioRouterApi>;
}

export interface PlayerAudioHandlerState extends AudioHandlerState {
  id: string;
}

export interface PlayerAudioHandlerApi extends AudioHandlerApi, Destroyable {
  id: string;

  state: PlayerAudioHandlerState;

  setChannelCount(channelCount: number): Observable<void>;

  restoreState(state: PlayerAudioHandlerState): Observable<void>;
}

export abstract class BasePlayerAudioHandler implements PlayerAudioHandlerApi {
  protected readonly _onEvent$: Subject<AudioHandlerEvent> = new Subject<AudioHandlerEvent>();
  protected readonly _onPeakProcessorEvent$: Subject<AudioPeakProcessorEvent> = new Subject<AudioPeakProcessorEvent>();
  protected readonly _onEffectEvent$: Subject<AudioEffectEvent> = new Subject<AudioEffectEvent>();

  protected _id: string;
  protected _channelCount: number = 0;

  protected _volume: number;
  protected _muted: boolean;
  protected _enabled: boolean = true;

  protected _audioPeakProcessor: AudioPeakProcessorApi | undefined;
  protected _audioRouter: AudioRouter | undefined;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(id: string, volume: number = AUDIO_DEFAULTS.volume, muted: boolean = AUDIO_DEFAULTS.muted, enabled: boolean = true) {
    this._id = id;
    this._volume = volume;
    this._muted = muted;
    this._enabled = enabled;
  }

  abstract get effects(): AudioEffectsApi;

  abstract inputAudioNode: AudioNode;

  abstract outputAudioNode: AudioNode;

  abstract restoreState(state: PlayerAudioHandlerState): Observable<void>;

  abstract createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void>;

  abstract createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<AudioRouterApi>;

  protected abstract _setVolumeMuted(volume: number, muted: boolean, emitEvent: boolean): void;

  get id(): string {
    return this._id;
  }

  get onEvent$(): Observable<AudioHandlerEvent> {
    return this._onEvent$.asObservable();
  }

  get router() {
    return this._audioRouter;
  }

  get onPeakProcessorEvent$(): Observable<AudioPeakProcessorEvent> {
    return this._onPeakProcessorEvent$.asObservable();
  }

  get volume(): number {
    return this.getVolume();
  }

  protected getVolume(): number {
    return this._volume;
  }

  get muted(): boolean {
    return this.getMuted();
  }

  protected getMuted(): boolean {
    return this._muted;
  }

  get enabled(): boolean {
    return this.getEnabled();
  }

  get channelCount(): number {
    return this._channelCount;
  }

  protected getEnabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): Observable<void> {
    return this._setEnabled(enabled);
  }

  protected _setEnabled(enabled: boolean, emitEvent = true): Observable<void> {
    if (enabled !== this._enabled) {
      this._enabled = enabled;
      return this.setVolumeMuted(this.volume, this.muted, emitEvent);
    } else {
      return emptyPassiveObservable();
    }
  }

  setMuted(muted: boolean): Observable<void> {
    return this.setVolumeMuted(this.volume, muted);
  }

  setVolume(volume: number): Observable<void> {
    return this.setVolumeMuted(volume, false);
  }

  protected setVolumeMuted(volume: number, muted: boolean, emitEvent = true): Observable<void> {
    return passiveObservable((observer) => {
      this._setVolumeMuted(volume, muted, emitEvent);
      nextCompleteObserver(observer);
    });
  }

  toggleMuted(): Observable<void> {
    return this.setMuted(!this._muted);
  }

  mute(): Observable<void> {
    return this.setMuted(true);
  }

  unmute(): Observable<void> {
    return this.setMuted(false);
  }

  setChannelCount(channelCount: number): Observable<void> {
    return passiveObservable((observer) => {
      this._setChannelCount(channelCount);
      nextCompleteObserver(observer);
    });
  }

  protected emitChangeEvent() {
    this._onEvent$.next({
      type: AudioHandlerEventType.AUDIO_HANDLER_CHANGE,
      data: {
        state: this.state,
      },
    });
  }

  protected emitAudioEffectParamChangeEvent(connection: AudioEffectGraphConnection, changedParameters: AudioEffectParameterChange[]) {
    this._onEffectEvent$.next({
      type: AudioEffectEventType.AUDIO_EFFECT_PARAMETER_CHANGE,
      data: {
        connection: connection,
        changedParameters: changedParameters,
      },
    });
  }

  protected emitAudioEffectGraphAddedEvent(connection: AudioEffectGraphConnection) {
    this._onEffectEvent$.next({
      type: AudioEffectEventType.AUDIO_EFFECT_GRAPH_ADDED,
      data: {
        connection: connection,
      },
    });
  }

  protected emitAudioEffectGraphRemovedEvent(connection: AudioEffectGraphConnection) {
    this._onEffectEvent$.next({
      type: AudioEffectEventType.AUDIO_EFFECT_GRAPH_REMOVED,
      data: {
        connection: connection,
      },
    });
  }

  protected _setChannelCount(channelCount: number): void {
    this._channelCount = channelCount;
    this.emitChangeEvent();
  }

  protected getState(): PlayerAudioHandlerState {
    return {
      id: this.id,

      enabled: this.enabled,
      channelCount: this.channelCount,

      volume: this.volume,
      muted: this.muted,

      peakProcessor: this._audioPeakProcessor?.state,
      router: this._audioRouter?.state,
      slots: [],
    };
  }

  get state(): PlayerAudioHandlerState {
    return this.getState();
  }

  destroy() {
    this._destroyBreaker.destroy();

    this._audioRouter?.destroy();
    this._audioRouter = undefined
    

    freeObserver(this._onEvent$);
    freeObserver(this._onPeakProcessorEvent$);
    freeObserver(this._onEffectEvent$);
  }
}

export class GainPlayerAudioHandler extends BasePlayerAudioHandler {
  protected readonly _inputGainNode: GainNode;
  protected readonly _outputNode: GainNode;
  protected readonly _sourceSlot: AudioSlot;
  protected readonly _routerSlot: AudioSlot;
  protected readonly _destinationSlot: AudioSlot;

  protected _audioEffectsProxy: AudioEffectsApi;
  protected _onRouterCreated$ = new Subject<void>();
  protected _isRouterBeingCreated = false;

  constructor(id: string, volume: number = AUDIO_DEFAULTS.volume, muted: boolean = AUDIO_DEFAULTS.muted, enabled: boolean = true) {
    super(id, volume, muted, enabled);

    this._audioEffectsProxy = this._createAudioEffectsProxy();
    this._audioEffectsProxy.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => this.emitChangeEvent());

    this._inputGainNode = OmakaseAudioContextProvider.audioContext.createGain();
    this._inputGainNode.channelCountMode = 'max';
    // connect it from outside class

    this._outputNode = OmakaseAudioContextProvider.audioContext.createGain();
    this._outputNode.channelCountMode = 'max';

    this._setVolumeMuted(this.volume, this.muted, false);

    //initialize slots

    const sourceSlotOutputNode = OmakaseAudioContextProvider.audioContext.createGain();
    sourceSlotOutputNode.channelCountMode = 'max';

    const routerSlotOutputNode = OmakaseAudioContextProvider.audioContext.createGain();
    routerSlotOutputNode.channelCountMode = 'max';

    const destinationSlotInputNode = OmakaseAudioContextProvider.audioContext.createGain();
    destinationSlotInputNode.channelCountMode = 'max';

    this._sourceSlot = {
      input: this._inputGainNode,
      output: sourceSlotOutputNode,
      isAttaching: false,
    };

    this._routerSlot = {
      input: sourceSlotOutputNode,
      output: destinationSlotInputNode,
      isAttaching: false,
    };

    this._destinationSlot = {
      input: destinationSlotInputNode,
      output: this._outputNode,
      isAttaching: false,
    };

    this._sourceSlot.input.connect(this._sourceSlot.output);
    this._routerSlot.input.connect(this._routerSlot.output);
    this._destinationSlot.input.connect(this._destinationSlot.output);
  }

  get effects(): AudioEffectsApi {
    return this._audioEffectsProxy;
  }

  createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void> {
    return passiveObservable((observer) => {
      if (this._audioPeakProcessor) {
        console.debug(`Audio peak processor already created for handler id=${this._id}`);
        nextCompleteObserver(observer);
      } else {
        let audioPeakProcessor = new AudioPeakProcessor(meterStandard);
        audioPeakProcessor.load(this.inputAudioNode).subscribe({
          next: (event) => {
            this._audioPeakProcessor = audioPeakProcessor;

            audioPeakProcessor.onEvent$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((event) => {
              this._onPeakProcessorEvent$.next(event);
            });

            this.emitChangeEvent();
            nextCompleteObserver(observer);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      }
    });
  }

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<AudioRouterApi> {
    return passiveObservable((observer) => {
      if (this._audioRouter) {
        console.debug(`Audio router already created for handler id=${this._id}`);
        nextCompleteObserver(observer, this._audioRouter);
      } else if (this._isRouterBeingCreated) {
        this._onRouterCreated$.pipe(take(1), takeUntil(this._destroyBreaker.observer)).subscribe(() => {
          nextCompleteObserver(observer, this._audioRouter!);
        });
      } else {
        if (isNullOrUndefined(inputsNumber) && this.channelCount <= 0) {
          throw new Error(`Can't create audio router before audio track is loaded`);
        }

        this._isRouterBeingCreated = true;

        // disconnect router slot
        this._routerSlot.input.disconnect(this._routerSlot.output);

        inputsNumber = isNullOrUndefined(inputsNumber) ? this.channelCount : inputsNumber!;

        let outputsNumberResolver = isNullOrUndefined(outputsNumber) ? () => this._channelCount : (maxChannelCount: number) => outputsNumber!;
        let audioRouter = new AudioRouter(this._routerSlot.output, inputsNumber, outputsNumberResolver);
        audioRouter.load().subscribe({
          next: (event) => {
            audioRouter.connectSource(this._routerSlot.input);
            this._audioRouter = audioRouter;

            audioRouter.onEvent$
              .pipe(
                takeUntil(this._destroyBreaker.observer),
                filter((event) => event.type === AudioRouterEventType.AUDIO_ROUTER_CHANGE)
              )
              .subscribe(() => this.emitChangeEvent());

            this.emitChangeEvent();

            nextCompleteObserver(this._onRouterCreated$);
            this._isRouterBeingCreated = false;

            nextCompleteObserver(observer, audioRouter);
          },
          error: (err) => {
            errorCompleteObserver(observer, err);
          },
        });
      }
    });
  }

  get inputAudioNode(): AudioNode {
    return this._inputGainNode;
  }

  get outputAudioNode(): AudioNode {
    return this._outputNode;
  }

  protected setEffectGraph(effectGraphState: AudioEffectGraphState, effectGraphConnection: AudioEffectGraphConnection) {
    // check if setting new graph is possible
    if (effectGraphConnection.slot === 'source') {
      if (this._sourceSlot.isAttaching) {
        return passiveObservable((observer) => errorCompleteObserver(observer, `Can't set new source slot effect graph before previous one initialized`));
      }
      this._sourceSlot.isAttaching = true;
    } else if (effectGraphConnection.slot === 'destination') {
      if (this._destinationSlot.isAttaching) {
        return passiveObservable((observer) => errorCompleteObserver(observer, `Can't set new source slot effect graph before previous one initialized`));
      }
      this._destinationSlot.isAttaching = true;
    }

    return passiveObservable((observer) => {
      if (effectGraphConnection.slot === 'router') {
        if (this._audioRouter) {
          this._audioRouter.setAudioEffectGraphs(effectGraphState, effectGraphConnection.routingPath).subscribe(() => {
            this.emitAudioEffectGraphAddedEvent(effectGraphConnection);
            nextCompleteObserver(observer);
          });
        } else {
          this.createAudioRouter().subscribe(() => {
            this._audioRouter!.setAudioEffectGraphs(effectGraphState, effectGraphConnection.routingPath).subscribe(() => {
              this.emitAudioEffectGraphAddedEvent(effectGraphConnection);
              nextCompleteObserver(observer);
            });
          });
        }
      } else {
        const slot = effectGraphConnection.slot === 'source' ? this._sourceSlot : this._destinationSlot;
        this._removeInterleavedEffectGraph(slot);
        this._setInterleavedAudioEffectGraph(effectGraphState, slot).subscribe({
          next: () => {
            slot.isAttaching = false;
            this.emitAudioEffectGraphAddedEvent(effectGraphConnection);
            nextCompleteObserver(observer);
          },
          error: (err) => {
            slot.isAttaching = false;
            errorCompleteObserver(observer, err);
          },
        });
      }
    });
  }

  protected removeEffectGraph(effectGraphConnection: AudioEffectGraphConnection) {
    return passiveObservable((observer) => {
      if (effectGraphConnection.slot === 'router') {
        if (this._audioRouter) {
          this._audioRouter.removeAudioEffectGraphs(effectGraphConnection.routingPath);
          this.emitAudioEffectGraphRemovedEvent(effectGraphConnection);
        }
      } else {
        const slot = effectGraphConnection.slot === 'source' ? this._sourceSlot : this._destinationSlot;
        this._removeInterleavedEffectGraph(slot);
        this.emitAudioEffectGraphRemovedEvent(effectGraphConnection);
        nextCompleteObserver(observer);
      }
    });
  }

  protected setEffectsParams(param: AudioEffectParam, effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<void> {
    if (effectGraphConnection.slot === 'router') {
      return passiveObservable((observer) => {
        if (this._audioRouter) {
          const changedRoutedEffectIds = this._audioRouter.setAudioEffectParams(param, {...filter, routingPath: effectGraphConnection.routingPath});
          this.emitAudioEffectParamChangeEvent(
            effectGraphConnection,
            changedRoutedEffectIds.map((routedEffect) => ({effectId: routedEffect.id, parameterName: param.name, routingPath: routedEffect.routingPath}))
          );
          nextCompleteObserver(observer);
        } else {
          console.debug('Main audio router not created.');
          nextCompleteObserver(observer);
        }
      });
    } else {
      return passiveObservable((observer) => {
        const slot = effectGraphConnection.slot === 'source' ? this._sourceSlot : this._destinationSlot;
        const changedIds = this._setInterleavedAudioEffectParams(param, slot, filter);
        this.emitAudioEffectParamChangeEvent(
          effectGraphConnection,
          changedIds.map((id) => ({effectId: id, parameterName: param.name}))
        );
        nextCompleteObserver(observer);
      });
    }
  }

  protected getEffectStates(effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<AudioEffectState[]> {
    return passiveObservable((observer) => {
      if (effectGraphConnection.slot === 'router') {
        if (this._audioRouter) {
          nextCompleteObserver(
            observer,
            this._audioRouter.findAudioEffectStates({
              ...filter,
              routingPath: effectGraphConnection.routingPath,
            })
          );
        }
      } else {
        const slot = effectGraphConnection.slot === 'source' ? this._sourceSlot : this._destinationSlot;
        nextCompleteObserver(observer, this._getInterleavedEffectStates(slot, filter));
      }
    });
  }

  protected getEffectGraphState(effectGraphConnection: AudioEffectGraphSpecificConnection): Observable<AudioEffectGraphState | undefined> {
    return passiveObservable((observer) => {
      if (effectGraphConnection.slot === 'router') {
        if (this._audioRouter) {
          nextCompleteObserver(observer, this._audioRouter.getEffectGraphState(effectGraphConnection.routingPath));
        } else {
          nextCompleteObserver(observer, undefined);
        }
      } else {
        const slot = effectGraphConnection.slot === 'source' ? this._sourceSlot : this._destinationSlot;
        nextCompleteObserver(observer, slot.effectGraph?.toState());
      }
    });
  }

  protected _getInterleavedEffectStates(slot: AudioSlot, filter?: AudioEffectFilter) {
    if (!slot.effectGraph) {
      console.debug(`No audio effect graph exists at given connection`);
      return [];
    }

    if (slot.isAttaching) {
      throw new OmpError(`Effect graph has not yet initialised`);
    }

    return slot.effectGraph.findAudioEffects(filter).map((effect) => effect.toState());
  }

  protected _setInterleavedAudioEffectParams(param: AudioEffectParam, slot: AudioSlot, filter?: AudioEffectFilter): string[] {
    if (!slot.effectGraph) {
      throw new OmpError('Source slot effects graph not defined for main audio');
    }
    let effects = slot.effectGraph.findAudioEffects(filter);
    effects.forEach((effect) => effect.setParam(param));
    return effects.map((effect) => effect.id);
  }

  protected _setInterleavedAudioEffectGraph(effectGraphState: AudioEffectGraphState, slot: AudioSlot) {
    let audioEffectGraph = new AudioEffectGraph(effectGraphState);

    return new Observable((observer) => {
      audioEffectGraph.initialize().subscribe(() => {
        slot.input.disconnect(slot.output);
        audioEffectGraph.sourceEffects.forEach((sourceEffect) => {
          const inputNodes = sourceEffect.getInputNodes();
          inputNodes.forEach((inputNode) => {
            slot.input.connect(inputNode);
          });
        });

        audioEffectGraph.destinationEffects.forEach((destinationEffect) => {
          destinationEffect.getOutputNode().connect(slot.output);
        });

        slot.effectGraph = audioEffectGraph;

        nextCompleteObserver(observer);
      });
    });
  }

  protected _removeInterleavedEffectGraph(slot: AudioSlot) {
    let effectGraph = slot.effectGraph;

    if (!effectGraph) {
      return;
    }

    effectGraph.sourceEffects.forEach((sourceEffect) => {
      const inputNodes = sourceEffect.getInputNodes();
      inputNodes.forEach((inputNode) => {
        slot.input.disconnect(inputNode);
      });
    });

    effectGraph.destinationEffects.forEach((destinationEffect) => {
      destinationEffect.getOutputNode().disconnect(slot.output);
    });

    slot.input.connect(slot.output);
    effectGraph.destroy();
    slot.effectGraph = undefined;
  }

  protected _createAudioEffectsProxy() {
    const self = this;
    return {
      setEffectGraph: function (effectGraphState: AudioEffectGraphState, effectGraphConnection: AudioEffectGraphConnection): Observable<void> {
        return self.setEffectGraph(effectGraphState, effectGraphConnection);
      },
      removeEffectGraph: function (effectGraphConnection: AudioEffectGraphConnection): Observable<void> {
        return self.removeEffectGraph(effectGraphConnection);
      },
      setEffectsParams: function (param: AudioEffectParam, effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<void> {
        return self.setEffectsParams(param, effectGraphConnection, filter);
      },
      getEffectStates(effectGraphConnection, filter) {
        return self.getEffectStates(effectGraphConnection, filter);
      },
      getEffectGraphState(effectGraphConnection) {
        return self.getEffectGraphState(effectGraphConnection);
      },
      onEvent$: this._onEffectEvent$,
    } satisfies AudioEffectsApi;
  }

  protected _setVolumeMuted(volume: number, muted: boolean, emitEvent: boolean): void {
    this._volume = Validators.volume()(volume);
    this._muted = muted;

    if (this._enabled) {
      this._inputGainNode.gain.value = this.muted ? 0 : this.volume;
    } else {
      this._inputGainNode.gain.value = 0;
    }

    if (emitEvent) {
      this.emitChangeEvent();
    }
  }

  override get state() {
    const state = {...super.state, slots: this.slotStates};
    return state;
  }

  private get slotStates(): AudioHandlerSlotState[] {
    const slotStates: AudioHandlerSlotState[] = [];

    if (this._sourceSlot.effectGraph) {
      slotStates.push({type: 'source', effectGraph: this._sourceSlot.effectGraph.toState()});
    }
    if (this._destinationSlot.effectGraph) {
      slotStates.push({type: 'destination', effectGraph: this._destinationSlot.effectGraph.toState()});
    }
    return slotStates;
  }

  restoreState(state: PlayerAudioHandlerState): Observable<void> {
    return passiveObservable((observer) => {
      let success = () => {
        this.emitChangeEvent();
        nextCompleteObserver(observer);
      };

      const restoredAudioEffects$ = new Subject<void>();
      const restoredAudioRouter$ = new Subject<void>();
      const restoredGeneralAudio$ = new Subject<void>();

      combineLatest([restoredAudioEffects$, restoredAudioRouter$, restoredGeneralAudio$]).subscribe(() => success());

      restoredAudioRouter$.subscribe(() => {
        if (state.slots.length) {
          const os$ = state.slots.map((slotState) => {
            return this.setEffectGraph(slotState.effectGraph, {slot: slotState.type});
          });

          forkJoin(os$).subscribe(() => nextCompleteObserver(restoredAudioEffects$));
        } else {
          nextCompleteObserver(restoredAudioEffects$);
        }
      });

      restoredGeneralAudio$.subscribe(() => {
        if (state.router) {
          this.createAudioRouter(state.router.inputsNumber, state.router.outputsNumber).subscribe(() => {
            this._audioRouter!.restoreState(state.router!).subscribe(() => nextCompleteObserver(restoredAudioRouter$));
          });
        } else {
          nextCompleteObserver(restoredAudioRouter$);
        }
      });

      this._setEnabled(state.enabled, false).subscribe(() => {
        this._setVolumeMuted(state.volume, state.muted, false);
        this._setChannelCount(state.channelCount);
        if (state.peakProcessor) {
          this.createPeakProcessor(this.state.peakProcessor?.meterStandard).subscribe(() => {
            nextCompleteObserver(restoredGeneralAudio$);
          });
        } else {
          nextCompleteObserver(restoredGeneralAudio$);
        }
      });
    });
  }

  destroy() {
    super.destroy();

    this._inputGainNode.disconnect();

    this._audioPeakProcessor?.destroy();
  }
}

export class MediaElementPlayerAudioHandler extends GainPlayerAudioHandler {
  protected readonly _mediaElementAudioSourceNode: MediaElementAudioSourceNode;

  constructor(id: string, mediaElement: HTMLMediaElement, volume: number = AUDIO_DEFAULTS.volume, muted: boolean = AUDIO_DEFAULTS.muted, enabled: boolean = true) {
    super(id, volume, muted, enabled);

    this._mediaElementAudioSourceNode = OmakaseAudioContextProvider.audioContext.createMediaElementSource(mediaElement);
    this._mediaElementAudioSourceNode.connect(this._inputGainNode);
    // connect it from outside class
  }

  destroy() {
    super.destroy();

    this._mediaElementAudioSourceNode.disconnect();
  }
}

export interface DisabledMediaElementSourcePlayerAudioHandlerState extends PlayerAudioHandlerState {
  providedVolume: number | undefined;
  providedMuted: boolean | undefined;
  // outputHandlerMuted: boolean;
}

/**
 * Workaround for
 * https://bugs.webkit.org/show_bug.cgi?id=180696
 */
export class DisabledMediaElementSourcePlayerAudioHandler extends BasePlayerAudioHandler {
  get effects(): AudioEffectsApi {
    const message = 'Effects api not supported for this media and browser combination';
    return {
      setEffectGraph: function (effectGraphState: AudioEffectGraphState, effectGraphConnection: AudioEffectGraphConnection): Observable<void> {
        console.warn(message);
        return passiveObservable((observer) => nextCompleteObserver(observer));
      },
      removeEffectGraph: function (effectGraphConnection: AudioEffectGraphConnection): Observable<void> {
        console.warn(message);
        return passiveObservable((observer) => nextCompleteObserver(observer));
      },
      setEffectsParams: function (param: AudioEffectParam, effectGraphConnection: AudioEffectGraphConnection, filter?: AudioEffectFilter): Observable<void> {
        console.warn(message);
        return passiveObservable((observer) => nextCompleteObserver(observer));
      },
      getEffectStates(effectGraphConnection, filter) {
        console.warn(message);
        return passiveObservable((observer) => nextCompleteObserver(observer, []));
      },
      getEffectGraphState(effectGraphConnection) {
        console.warn(message);
        return passiveObservable((observer) => nextCompleteObserver(observer));
      },
      onEvent$: this._onEffectEvent$,
    } satisfies AudioEffectsApi;
  }

  protected _outputAudioHandler: PlayerAudioHandlerApi;

  protected _providedVolume: number | undefined;
  protected _providedMuted: boolean | undefined;

  protected _destroyBreaker = new ObserverBreaker();
  protected _mediaElement: HTMLMediaElement;

  constructor(id: string, mediaElement: HTMLMediaElement, outputAudioHandler: PlayerAudioHandlerApi) {
    super(id);

    this._outputAudioHandler = outputAudioHandler;
    this._mediaElement = mediaElement;

    this._outputAudioHandler.onEvent$
      .pipe(filter((p) => p.type === AudioHandlerEventType.AUDIO_HANDLER_CHANGE))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this._resolveVolumeMuted();
      });
  }

  protected getMuted(): boolean {
    return this._providedMuted ?? this._muted; // in GainPlayerAudioHandler _setVolumeMuted is called in constructor to initialize values, thus getMuted() must return value
  }

  setMuted(muted: boolean): Observable<void> {
    this._providedMuted = muted;
    const outputHandlerMuted = this._outputAudioHandler.muted;
    return this.setVolumeMuted(this._volume, muted || outputHandlerMuted, true);
  }

  protected _setVolumeMuted(volume: number, muted: boolean, emitEvent: boolean): void {
    this._volume = Validators.volume()(volume);
    this._muted = muted;

    if (this._enabled) {
      const shouldMute = this._outputAudioHandler.muted || this._muted;
      this._mediaElement.volume = shouldMute ? 0 : this._volume;
    } else {
      this._mediaElement.volume = 0;
    }

    if (emitEvent) {
      this.emitChangeEvent();
    }
  }

  protected getState(): DisabledMediaElementSourcePlayerAudioHandlerState {
    return {
      ...super.getState(),
      muted: this._muted,
      volume: this._volume,
      providedMuted: this._providedMuted,
      providedVolume: this._providedVolume,
    };
  }

  protected _resolveVolumeMuted() {
    let newVolume = this.getVolume() * this._outputAudioHandler.volume;
    let newMuted = this._providedMuted ? this._providedMuted : this._outputAudioHandler.muted;
    this._setVolumeMuted(newVolume, newMuted, false);
  }

  restoreState(state: DisabledMediaElementSourcePlayerAudioHandlerState): Observable<void> {
    return passiveObservable((observer) => {
      this._setEnabled(state.enabled, false).subscribe(() => {
        this._providedMuted = state.providedMuted;
        this._providedVolume = state.providedVolume;
        this._volume = state.volume;
        this._muted = state.muted;
        this._setChannelCount(state.channelCount);
        this._resolveVolumeMuted();
        nextCompleteObserver(observer);
      });
    });
  }

  createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void> {
    console.warn('Peak processor not supported for this media and browser combination');
    return passiveObservable((observer) => nextCompleteObserver(observer));
  }
  createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<AudioRouterApi> {
    return passiveObservable((observer) => errorCompleteObserver(observer, 'Audio router not supported for this media and browser combination'));
  }

  get inputAudioNode(): AudioNode {
    return OmakaseAudioContextProvider.audioContext.createGain();
  }
  get outputAudioNode(): AudioNode {
    return OmakaseAudioContextProvider.audioContext.createGain();
  }

  protected _setMuted(muted: boolean): Observable<void> {
    return super.setMuted(muted);
  }

  protected getVolume(): number {
    return this._providedVolume ?? this._volume; // in GainPlayerAudioHandler _setVolumeMuted is called in constructor to initialize values, thus getVolume() must return value
  }

  setVolume(volume: number): Observable<void> {
    this._providedVolume = Validators.volume()(volume);
    this._providedMuted = false;
    let newVolume = this._providedVolume * this._outputAudioHandler.volume * (this._outputAudioHandler.muted ? 0 : 1);

    return this._setVolume(newVolume);
  }

  protected _setVolume(volume: number): Observable<void> {
    return super.setVolume(volume);
  }

  destroy() {
    super.destroy();
    this._destroyBreaker.destroy();
  }
}

export class DebugPlayerAudioHandler extends BasePlayerAudioHandler {
  protected readonly _gainNode: GainNode;

  constructor(id: string, volume: number = AUDIO_DEFAULTS.volume, muted: boolean = AUDIO_DEFAULTS.muted, enabled: boolean = true) {
    super(id, volume, muted, enabled);

    this._gainNode = OmakaseAudioContextProvider.audioContext.createGain();
  }

  get inputAudioNode(): AudioNode {
    return this._gainNode;
  }

  get outputAudioNode(): AudioNode {
    return this._gainNode;
  }

  get effects(): AudioEffectsApi {
    throw new Error('Method not implemented.');
  }

  protected _setVolumeMuted(volume: number, muted: boolean): void {}

  restoreState(state: PlayerAudioHandlerState): Observable<void> {
    return passiveObservable((observer) => {
      nextCompleteObserver(observer);
    });
  }

  createPeakProcessor(meterStandard?: AudioPeakProcessorMeterStandard): Observable<void> {
    return passiveObservable((observer) => {
      nextCompleteObserver(observer);
    });
  }

  createAudioRouter(inputsNumber?: number, outputsNumber?: number): Observable<AudioRouterApi> {
    return passiveObservable((observer) => {
      nextCompleteObserver(observer, this._audioRouter!);
    });
  }
}
