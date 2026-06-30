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

import type {Destroyable, Serializable} from '../common/capabilities';
import {OpStage, type OpStageState} from '../common/op-stage';
import {forkJoin, map, Observable, Subject, tap} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import {freeObserver, nextCompleteObserver, passiveObservable} from '../util/rxjs-util';
import {Validators} from '../common/validators';
import {AudioUtil} from './audio-util';
import type {
  AudioEffect,
  AudioEffectFilter,
  AudioEffectGraphState,
  AudioEffectParam,
  AudioEffectState,
  RoutedAudioEffect,
  RoutedAudioEffectGraph,
} from './audio-effects';
import {AudioEffectGraph} from './audio-effects';
import {isNonNullable} from '../util/util-functions';
import {OmpError} from '../types';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';

export enum AudioRouterEventType {
  AUDIO_ROUTER_LOADING = 'AUDIO_ROUTER_LOADING',
  AUDIO_ROUTER_LOADED = 'AUDIO_ROUTER_LOADED',
  AUDIO_ROUTER_LOAD_ERROR = 'AUDIO_ROUTER_LOAD_ERROR',

  AUDIO_ROUTER_CHANGE = 'AUDIO_ROUTER_CHANGE',
}

export interface AudioRouterEventData extends Serializable {
  state: AudioRouterState;
}

export interface AudioRouterErrorEventData extends AudioRouterEventData {
  error: string | undefined;
}

export type AudioRouterEventTypeDataMap = {
  [AudioRouterEventType.AUDIO_ROUTER_LOADING]: AudioRouterEventData;
  [AudioRouterEventType.AUDIO_ROUTER_LOADED]: AudioRouterEventData;
  [AudioRouterEventType.AUDIO_ROUTER_LOAD_ERROR]: AudioRouterErrorEventData;

  [AudioRouterEventType.AUDIO_ROUTER_CHANGE]: AudioRouterEventData;
};

export type AudioRouterEvent = {
  [K in AudioRouterEventType]: {
    type: K;
    data: AudioRouterEventTypeDataMap[K];
  };
}[keyof AudioRouterEventTypeDataMap];

export interface AudioRouterState {
  loadStage: OpStageState;

  /**
   * Number of audio inputs
   */
  inputsNumber: number;

  /**
   * Number of audio outputs
   */
  outputsNumber: number;

  /**
   * Audio routing matrix
   */
  routingConnections: AudioRoutingConnection[][];

  /**
   * Audio router initial/default connections
   */
  initialRoutingConnections: AudioRoutingConnection[];

  routingRoutes: AudioRoutingRoute[];
}

export interface AudioRouterInputSoloMuteState {
  /**
   * Audio router input number
   */
  inputNumber: number;

  /**
   * Flag that tells if audio router input is soloed
   */
  soloed: boolean;

  /**
   * Flag that tells if audio router input is muted
   */
  muted: boolean;

  /**
   * Audio router soloed input connections
   */
  inputSoloedConnections: AudioRoutingConnection[];

  /**
   * Audio router muted input connections
   */
  inputMutedConnections: AudioRoutingConnection[];

  /**
   * Audio router connections before input solo action (current input connections are not included)
   */
  unsoloConnections: AudioRoutingConnection[];
}

export type AudioRoutingInputPath = Pick<AudioRoutingPath, 'input'>;

export type AudioRoutingOutputPath = Pick<AudioRoutingPath, 'output'>;

type Routed<T, K extends PropertyKey = 'object'> = {
  routingPath: AudioRoutingPath;
} & {
  [P in K]: T;
};

export interface InternalAudioRouterApi extends AudioRouterApi, Destroyable {
  onEvent$: Observable<AudioRouterEvent>;

  load(): Observable<void>;

  connectSource(audioNode: AudioNode): void;

  disconnectSource(): void;

  destroy(): void;
}

export interface AudioRouterApi {
  onEvent$: Observable<AudioRouterEvent>;
  state: AudioRouterState;
  getDefaultRoutingConnections(): AudioRoutingConnection[];
  setDefaultRoutingConnections(connections: AudioRoutingConnection[]): Observable<void>;
  toggleSolo(routingPath: AudioRoutingInputPath): Observable<void>;
  toggleMute(routingPath: AudioRoutingInputPath): Observable<void>;
  resetRouter(): Observable<void>;
  updateConnections(connections: AudioRoutingConnection[]): Observable<void>;
}

const defaultAudioOutputsResolver: (maxChannelCount: number) => number = (maxChannelCount: number) => {
  if (maxChannelCount <= 1) {
    return 1;
  } else if (maxChannelCount >= 2 && maxChannelCount <= 5) {
    return 2;
  } else if (maxChannelCount >= 6) {
    return 6;
  } else {
    return maxChannelCount;
  }
};

/**
 * Describes {@ OmpAudioRoutingPoint} connection status - connected or disconnected
 */
export interface AudioRoutingConnection {
  /**
   * Routing path - channel splitter output and channel merger input
   */
  path: AudioRoutingPath;

  /**
   * Connected status, true = connected, false = disconnected
   */
  connected: boolean;
}

/**
 * Describes routing path - channel splitter output and channel merger input
 */
export interface AudioRoutingPath {
  /**
   * Input - Channel splitter output
   */
  input: number;

  /**
   * Output - Channel merger input
   */
  output: number;
}

/**
 * Describes state on {@link AudioRoutingPath}
 */
export interface AudioRoutingRoute {
  /**
   * Routing path
   */
  path: AudioRoutingPath;

  /**
   * Connection status
   */
  connection: AudioRoutingConnection;

  /**
   * Audio effect graph state
   */
  audioEffectGraphState: AudioEffectGraphState | undefined;
}

export class AudioRouter implements InternalAudioRouterApi {
  protected readonly _onEvent$: Subject<AudioRouterEvent> = new Subject<AudioRouterEvent>();

  protected readonly _loadStage: OpStage;

  protected _inputsNumber: number;
  protected _outputsNumber: number;

  protected _sourceAudioNode?: AudioNode;
  protected _channelSplitterNode: ChannelSplitterNode;
  protected _channelMergerNode: ChannelMergerNode;

  protected _defaultRoutingConnections: AudioRoutingConnection[];

  protected _soloMuteStatesByInput: Map<number, AudioRouterInputSoloMuteState>;
  protected _lastChangedSoloMuteStateInput: number | undefined;

  protected _connectionsByInputOutput: Map<number, Map<number, AudioRoutingConnection>>;
  protected _effectGraphsByInputOutput: Map<number, Map<number, AudioEffectGraph | undefined>>;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(audioOutputNode: AudioNode, inputsNumber: number, outputsNumberResolver?: (maxChannelCount: number) => number) {
    this._loadStage = new OpStage();

    this._soloMuteStatesByInput = new Map<number, AudioRouterInputSoloMuteState>();

    let maxChannelCount = OmakaseAudioContextProvider.audioContext.destination.maxChannelCount; // the maximum number of channels that this hardware is capable of supporting

    this._inputsNumber = Validators.audioChannelsNumber()(inputsNumber);
    if (outputsNumberResolver) {
      this._outputsNumber = outputsNumberResolver(maxChannelCount);
    } else {
      this._outputsNumber = defaultAudioOutputsResolver(maxChannelCount);
    }

    this._defaultRoutingConnections = AudioUtil.resolveDefaultAudioRouting(this._inputsNumber, this._outputsNumber);

    this._channelSplitterNode = OmakaseAudioContextProvider.audioContext.createChannelSplitter(this._inputsNumber);
    this._channelMergerNode = OmakaseAudioContextProvider.audioContext.createChannelMerger(this._outputsNumber);

    this._connectionsByInputOutput = new Map<number, Map<number, AudioRoutingConnection>>();
    this._effectGraphsByInputOutput = new Map();

    for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
      let connectionsByOutput: Map<number, AudioRoutingConnection> = new Map<number, AudioRoutingConnection>();
      this._connectionsByInputOutput.set(inputNumber, connectionsByOutput);

      let inputEffectsGraphsByOutput: Map<number, AudioEffectGraph> = new Map<number, AudioEffectGraph>();
      this._effectGraphsByInputOutput.set(inputNumber, inputEffectsGraphsByOutput);

      for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
        connectionsByOutput.set(outputNumber, {
          path: {
            input: inputNumber,
            output: outputNumber,
          },
          connected: false,
        });
      }
    }

    // connect silent gain node to prevent buffer overflows and stalls when audio isn't routed to destination
    let silentGainNode = OmakaseAudioContextProvider.audioContext.createGain();
    silentGainNode.gain.value = 0; // Set gain to 0 (silent)
    silentGainNode.connect(audioOutputNode);
    this._channelSplitterNode.connect(silentGainNode);

    this._channelMergerNode.connect(audioOutputNode);
  }

  setDefaultRoutingConnections(connections: AudioRoutingConnection[]): Observable<void> {
    return passiveObservable((observer) => {
      if (connections.length !== this._inputsNumber * this._outputsNumber) {
        console.error("Initial routing connections length doesn't match router's inputs and outputs number");
      } else {
        this._defaultRoutingConnections = connections;
        this.emitChange();
      }
      nextCompleteObserver(observer);
    });
  }
  resetRouter(): Observable<void> {
    return this.updateConnections(this._defaultRoutingConnections);
  }

  get onEvent$(): Observable<AudioRouterEvent> {
    return this._onEvent$.asObservable();
  }

  load(): Observable<void> {
    return new Observable<void>((observer) => {
      this._loadStage.start();
      this._onEvent$.next({
        type: AudioRouterEventType.AUDIO_ROUTER_LOADING,
        data: {
          state: this.state,
        },
      });

      this.updateConnections(this.getDefaultRoutingConnections()).subscribe(() => {
        this._loadStage.success();
        this._onEvent$.next({
          type: AudioRouterEventType.AUDIO_ROUTER_LOADED,
          data: {
            state: this.state,
          },
        });
        nextCompleteObserver(observer);
      });
    });
  }

  get isSourceConnected(): boolean {
    return !!this._sourceAudioNode;
  }

  disconnectSource() {
    if (this.isSourceConnected) {
      try {
        this._sourceAudioNode!.disconnect(this._channelSplitterNode);
      } catch (e) {
        console.debug();
      }
    }
  }

  connectSource(audioNode: AudioNode) {
    this.disconnectSource();
    this._sourceAudioNode = audioNode;
    this._sourceAudioNode.channelCountMode = 'max';
    this._sourceAudioNode.channelCount = this._inputsNumber;
    this._sourceAudioNode.connect(this._channelSplitterNode);
  }

  updateConnections(connections: AudioRoutingConnection[]): Observable<void> {
    return passiveObservable((observer) => {
      connections.forEach((p) => this._updateConnection(p, false));

      this._updateInputsSoloMuteState();

      this.emitChange();
      nextCompleteObserver(observer);
    });
  }

  protected _updateConnection(newConnection: AudioRoutingConnection, emitEvent = true) {
    if (!this._connectionsByInputOutput.has(newConnection.path.input)) {
      console.debug(`Unknown routing path: ${JSON.stringify(newConnection)}`);
      return;
    }

    if (this._channelSplitterNode && this._channelMergerNode) {
      let byOutput = this._connectionsByInputOutput.get(newConnection.path.input)!;
      let existingConnection = byOutput.get(newConnection.path.output);

      let audioGraphByOutput = this._effectGraphsByInputOutput.get(newConnection.path.input)!;
      let audioGraph = audioGraphByOutput.get(newConnection.path.output);

      // change is required only if newNode doesn't exist already and is connected, or if it exists and new connected state differs from existing
      let connectionChanged = (!existingConnection && newConnection.connected) || (existingConnection && existingConnection.connected !== newConnection.connected);

      if (connectionChanged) {
        try {
          if (newConnection.connected) {
            if (audioGraph) {
              this.connectEffectGraph(audioGraph, newConnection.path.input, newConnection.path.output);
            } else {
              this._channelSplitterNode.connect(this._channelMergerNode, newConnection.path.input, newConnection.path.output);
            }
          } else {
            if (audioGraph) {
              this.disconnectEffectGraph(audioGraph, newConnection.path.input, newConnection.path.output);
            } else {
              this._channelSplitterNode.disconnect(this._channelMergerNode, newConnection.path.input, newConnection.path.output);
            }
          }
          byOutput.set(newConnection.path.output, newConnection);
          if (emitEvent) {
            this.emitChange();
          }
        } catch (e) {
          console.warn(e);
        }
      }
    }
  }

  protected emitChange() {
    this._onEvent$.next({
      type: AudioRouterEventType.AUDIO_ROUTER_CHANGE,
      data: {
        state: this.state,
      },
    });
  }

  getDefaultRoutingConnections(): AudioRoutingConnection[] {
    return this._defaultRoutingConnections;
  }

  protected getRoutingConnections(): AudioRoutingConnection[][] {
    return [...this._connectionsByInputOutput.values()].map((p) => [...p.values()]);
  }

  get state(): AudioRouterState {
    let routingRoutes: AudioRoutingRoute[] = [];
    for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
      for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
        let routingRoute: AudioRoutingRoute = {
          path: {
            input: inputNumber,
            output: outputNumber,
          },
          connection: {
            ...this._connectionsByInputOutput.get(inputNumber)!.get(outputNumber)!,
          },
          audioEffectGraphState: this._effectGraphsByInputOutput.get(inputNumber)?.get(outputNumber)?.toState(),
        };
        routingRoutes.push(routingRoute);
      }
    }

    return {
      loadStage: this._loadStage.state,

      inputsNumber: this._inputsNumber,
      outputsNumber: this._outputsNumber,
      routingConnections: this.getRoutingConnections(),
      routingRoutes: routingRoutes,
      initialRoutingConnections: this._defaultRoutingConnections,
    };
  }

  restoreState(state: AudioRouterState): Observable<void> {
    return passiveObservable((observer) => {
      const os$ = state.routingRoutes.map((routingRoute) => {
        return new Observable((observer) => {
          this._updateConnection({path: routingRoute.path, connected: routingRoute.connection.connected});
          if (routingRoute.audioEffectGraphState) {
            this._setEffectGraph(routingRoute.audioEffectGraphState, routingRoute.path.input, routingRoute.path.output).subscribe(() => nextCompleteObserver(observer));
          } else {
            nextCompleteObserver(observer);
          }
        });
      });
      if (os$.length) {
        forkJoin(os$).subscribe(() => nextCompleteObserver(observer));
      } else {
        nextCompleteObserver(observer);
      }
    });
  }

  toggleSolo(routingPath: AudioRoutingInputPath): Observable<void> {
    return passiveObservable((observer) => {
      if (routingPath.input < 0 || routingPath.input >= this._inputsNumber) {
        throw new Error('Invalid routing path');
      }

      const inputState = this._soloMuteStatesByInput.get(routingPath.input);
      if (inputState && inputState.soloed) {
        this._unsolo(routingPath.input);
      } else {
        this._solo(routingPath.input);
      }

      this.emitChange();
      nextCompleteObserver(observer);
    });
  }

  protected _solo(inputNumber: number) {
    const inputSoloedState = [...this._soloMuteStatesByInput.values()].find((inputState) => inputState.soloed);
    if (inputSoloedState) {
      this._unsolo(inputSoloedState.inputNumber, false);
    }

    const routingConnections = this.getRoutingConnections();
    let inputSoloedConnections = routingConnections[inputNumber]!;
    if (!inputSoloedConnections.filter((connection) => connection.connected).length) {
      const inputState = this._soloMuteStatesByInput.get(inputNumber);
      if (inputState && inputState.inputMutedConnections?.length) {
        inputSoloedConnections = inputState.inputMutedConnections;
      } else {
        const inputInitialRoutingConnections = this.getInitialRoutingConnectionsForInput(inputNumber);
        if (inputInitialRoutingConnections.filter((connection) => connection.connected).length) {
          inputSoloedConnections = inputInitialRoutingConnections;
        } else {
          inputSoloedConnections = AudioUtil.resolveDefaultAudioRoutingForInput(inputNumber, this._inputsNumber, this._outputsNumber);
        }
      }
      inputSoloedConnections.forEach((connection) => {
        this._updateConnection(connection, false);
      });
    }

    routingConnections.forEach((connections, index) => {
      if (index !== inputNumber) {
        connections.forEach((connection) => {
          const newConnection: AudioRoutingConnection = {
            ...connection,
            connected: false,
          };
          this._updateConnection(newConnection, false);
        });
      }
    });

    this._soloMuteStatesByInput.forEach((inputState) => {
      if (inputState.muted) {
        if (inputState.inputNumber === inputNumber) {
          inputState.inputMutedConnections = [];
          inputState.muted = false;
        } else {
          inputState.muted = false;
        }

        this._lastChangedSoloMuteStateInput = inputState.inputNumber;
        // this.emitChange();
      }
    });

    this.setInputSoloMuteState(
      inputNumber,
      {
        inputNumber,
        inputSoloedConnections,
        inputMutedConnections: this._soloMuteStatesByInput.get(inputNumber)?.inputMutedConnections ?? [],
        unsoloConnections: routingConnections.filter((_, index) => index !== inputNumber).flatMap((p) => [...p.values()]),
        soloed: true,
        muted: false,
      },
      false
    );
  }

  private setInputSoloMuteState(inputNumber: number, state: AudioRouterInputSoloMuteState, emitEvent: boolean = true) {
    this._lastChangedSoloMuteStateInput = inputNumber;
    this._soloMuteStatesByInput.set(inputNumber, state);
    if (emitEvent) {
      this.emitChange();
    }
  }

  protected _unsolo(inputNumber: number, checkMute = true) {
    const inputState = this._soloMuteStatesByInput.get(inputNumber)!;
    if (inputState.unsoloConnections.length) {
      inputState.unsoloConnections.forEach((connection) => {
        this._updateConnection(connection, false);
      });
    } else {
      this.getInitialRoutingConnectionsForInput(inputNumber)
        .filter((_, index) => index !== inputNumber)
        .forEach((connection) => {
          this._updateConnection(connection, false);
        });
    }

    if (checkMute) {
      const routingConnections = this.getRoutingConnections();
      routingConnections.forEach((connections, index) => {
        const filteredConnections = connections.filter((connection) => connection.connected);
        if (!filteredConnections.length) {
          this._mute(index);
        }
      });
    }

    this.resetInputSoloMuteState(inputNumber);
  }

  toggleMute(routingPath: AudioRoutingInputPath): Observable<void> {
    return passiveObservable((observer) => {
      if (routingPath.input < 0 || routingPath.input >= this._inputsNumber) {
        throw new Error('Invalid routing path');
      }

      const inputSoloedState = [...this._soloMuteStatesByInput.values()].find((inputState) => inputState.soloed);
      if (inputSoloedState) {
        this._unsolo(inputSoloedState.inputNumber);

        const inputState = this._soloMuteStatesByInput.get(routingPath.input);
        if (inputState && !inputState.muted) {
          this._mute(routingPath.input);
        }
      } else {
        const inputState = this._soloMuteStatesByInput.get(routingPath.input);
        if (inputState && inputState.muted) {
          this._unmute(routingPath.input);
        } else {
          this._mute(routingPath.input);
        }
      }
      this.emitChange();
      nextCompleteObserver(observer);
    });
  }

  protected _mute(inputNumber: number) {
    const inputState = this._soloMuteStatesByInput.get(inputNumber);
    const routingConnections = this.getRoutingConnections();
    let inputMutedConnections: AudioRoutingConnection[];
    if (inputState && inputState.inputMutedConnections.length) {
      inputMutedConnections = inputState.inputMutedConnections;
    } else {
      const filteredConnections = routingConnections[inputNumber]!.filter((connection) => connection.connected);
      if (filteredConnections.length) {
        inputMutedConnections = routingConnections[inputNumber]!;
      } else {
        inputMutedConnections = [];
      }
    }

    inputMutedConnections.forEach((connection) => {
      const newConnection: AudioRoutingConnection = {
        ...connection,
        connected: false,
      };
      this._updateConnection(newConnection, false);
    });

    this.setInputSoloMuteState(
      inputNumber,
      {
        ...this.createInitialSoloMuteState(inputNumber),
        inputMutedConnections,
        muted: true,
      },
      false
    );
  }

  protected _unmute(inputNumber: number) {
    const inputState = this._soloMuteStatesByInput.get(inputNumber);
    if (inputState && inputState.inputMutedConnections.length) {
      inputState.inputMutedConnections.forEach((connection) => {
        this._updateConnection(connection, false);
      });
    } else {
      const inputInitialRoutingConnections = this.getInitialRoutingConnectionsForInput(inputNumber).filter((connection) => connection.connected);
      if (inputInitialRoutingConnections.length) {
        inputInitialRoutingConnections.forEach((connection) => {
          this._updateConnection(connection, false);
        });
      } else {
        AudioUtil.resolveDefaultAudioRoutingForInput(inputNumber, this._inputsNumber, this._outputsNumber).forEach((connection) => {
          this._updateConnection(connection, false);
        });
      }
    }

    this.resetInputSoloMuteState(inputNumber, false);
  }

  private getInitialRoutingConnectionsForInput(inputNumber: number): AudioRoutingConnection[] {
    return this._defaultRoutingConnections.filter((p) => p.path.input === inputNumber);
  }

  resetInputsSoloMuteState(): void {
    [...Array(this._inputsNumber).keys()].forEach((inputNumber) => {
      this.resetInputSoloMuteState(inputNumber);
    });
  }

  protected resetInputSoloMuteState(inputNumber: number, emitEvent: boolean = true): void {
    this.setInputSoloMuteState(inputNumber, this.createInitialSoloMuteState(inputNumber), emitEvent);
  }

  protected createInitialSoloMuteState(inputNumber: number): AudioRouterInputSoloMuteState {
    return {
      inputNumber,
      inputSoloedConnections: [],
      inputMutedConnections: [],
      unsoloConnections: [],
      soloed: false,
      muted: false,
    };
  }

  protected _updateInputsSoloMuteState() {
    const routingConnections = this.getRoutingConnections();
    let inputSoloedState = [...this._soloMuteStatesByInput.values()].find((inputState) => inputState.soloed);

    if (inputSoloedState) {
      for (let inputNumber = 0; inputNumber < routingConnections.length; inputNumber++) {
        const filteredConnections = routingConnections[inputNumber]!.filter((connection) => connection.connected);
        if ((inputSoloedState.inputNumber === inputNumber && !filteredConnections.length) || (inputSoloedState.inputNumber !== inputNumber && filteredConnections.length)) {
          this.resetInputSoloMuteState(inputSoloedState.inputNumber);
          inputSoloedState = void 0;
          break;
        }
      }
    }

    routingConnections.forEach((connections, inputNumber) => {
      const filteredConnections = connections.filter((connection) => connection.connected);
      const inputState = this._soloMuteStatesByInput.get(inputNumber);
      if (!filteredConnections.length && inputState && !inputState.muted && !inputSoloedState) {
        this.setInputSoloMuteState(inputState.inputNumber, {
          ...this.createInitialSoloMuteState(inputState.inputNumber),
          inputMutedConnections: inputState.inputMutedConnections,
          muted: true,
        });
      } else if (filteredConnections.length && inputState && inputState.muted) {
        this.resetInputSoloMuteState(inputState.inputNumber);
      }
    });
  }

  setAudioEffectGraphs(effectGraphState: AudioEffectGraphState, routingPath?: Partial<AudioRoutingPath>): Observable<void> {
    return this._setEffectsGraphs(effectGraphState, routingPath);
  }

  removeAudioEffectGraphs(routingPath?: Partial<AudioRoutingPath>) {
    this._setEffectsGraphs(void 0, routingPath);
  }

  findAudioEffectGraphs(routingPath?: Partial<AudioRoutingPath>): RoutedAudioEffectGraph[] {
    return this._getByRoutingPath(this._effectGraphsByInputOutput, routingPath).map((routedObject) => ({effectGraph: routedObject.object, routingPath: routedObject.routingPath}));
  }

  getEffectGraphState(routingPath: AudioRoutingPath): AudioEffectGraphState | undefined {
    return this.findAudioEffectGraphs(routingPath).at(0)?.effectGraph.toState();
  }

  protected _findRoutedAudioEffects(filter?: {routingPath?: Partial<AudioRoutingPath> | undefined} & AudioEffectFilter): RoutedAudioEffect[] {
    let routedAudioEffectGraphs = this.findAudioEffectGraphs(filter?.routingPath);
    return routedAudioEffectGraphs.flatMap((routedAudioEffectGraph) => {
      return routedAudioEffectGraph.effectGraph
        .findAudioEffects({id: filter?.id, effectType: filter?.effectType, attrs: filter?.attrs})
        .map((effect) => ({effect: effect, routingPath: routedAudioEffectGraph.routingPath}));
    });
  }

  findAudioEffects(filter?: {routingPath?: Partial<AudioRoutingPath> | undefined} & AudioEffectFilter): AudioEffect[] {
    return this._findRoutedAudioEffects(filter).map((routedEffect) => routedEffect.effect);
  }

  findAudioEffectStates(filter?: {routingPath?: Partial<AudioRoutingPath> | undefined} & AudioEffectFilter): AudioEffectState[] {
    return this.findAudioEffects(filter).map((effect) => effect.toState());
  }

  setAudioEffectParams(
    param: AudioEffectParam,
    filter?: {
      routingPath?: Partial<AudioRoutingPath> | undefined;
    } & AudioEffectFilter
  ) {
    let routedEffects = this._findRoutedAudioEffects(filter);
    routedEffects.forEach((routedEffect) => {
      routedEffect.effect.setParam(param);
    });
    this.emitChange();

    return routedEffects.map((routedEffect) => ({id: routedEffect.effect.id, routingPath: routedEffect.routingPath}));
  }

  private _setEffectsGraphs(effectsGraphState: AudioEffectGraphState | undefined, routingPath?: Partial<AudioRoutingPath>): Observable<void> {
    if (!this._checkIfEffectsGraphsCanBeChanged(routingPath)) {
      throw new OmpError(`Effects can't be changed before initialization finishes on routing path ${routingPath}`);
    }
    const allReady$: Observable<void>[] = [];
    if (!routingPath || (routingPath.input === void 0 && routingPath.output === void 0)) {
      for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const ready$ = this._setEffectGraph(effectsGraphState, inputNumber, outputNumber, false);
          allReady$.push(ready$);
        }
      }
    } else {
      if (routingPath.input !== void 0 && routingPath.output !== void 0) {
        const ready$ = this._setEffectGraph(effectsGraphState, routingPath.input, routingPath.output, false);
        allReady$.push(ready$);
      } else if (routingPath.input === void 0 && routingPath.output !== void 0) {
        // set on all input's and given output
        for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
          const ready$ = this._setEffectGraph(effectsGraphState, inputNumber, routingPath.output, false);
          allReady$.push(ready$);
        }
      } else if (routingPath.input !== void 0 && routingPath.output === void 0) {
        // set on all output's and given input
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const ready$ = this._setEffectGraph(effectsGraphState, routingPath.input, outputNumber, false);
          allReady$.push(ready$);
        }
      }
    }

    return new Observable((observer) => {
      forkJoin(allReady$).subscribe(() => nextCompleteObserver(observer));
      this.emitChange();
    });
  }

  private _checkIfEffectsGraphsCanBeChanged(routingPath?: Partial<AudioRoutingPath>) {
    if (!routingPath || (routingPath.input === void 0 && routingPath.output === void 0)) {
      for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const effectsGraph = this._effectGraphsByInputOutput.get(inputNumber)?.get(outputNumber);
          if (effectsGraph && !effectsGraph.initialized) {
            return false;
          }
        }
      }
    } else {
      if (routingPath.input !== void 0 && routingPath.output !== void 0) {
        const effectsGraph = this._effectGraphsByInputOutput.get(routingPath.input)?.get(routingPath.output);
        if (effectsGraph && !effectsGraph.initialized) {
          return false;
        }
      } else if (routingPath.input === void 0 && routingPath.output !== void 0) {
        for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
          const effectsGraph = this._effectGraphsByInputOutput.get(inputNumber)?.get(routingPath.output);
          if (effectsGraph && !effectsGraph.initialized) {
            return false;
          }
        }
      } else if (routingPath.input !== void 0 && routingPath.output === void 0) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const effectsGraph = this._effectGraphsByInputOutput.get(routingPath.input)?.get(outputNumber);
          if (effectsGraph && !effectsGraph.initialized) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private _setEffectGraph(effectGraphState: AudioEffectGraphState | undefined, input: number, output: number, emitEvent = true): Observable<void> {
    let oldConnection = this._connectionsByInputOutput.get(input)!.get(output)!;

    // if node was connected, first disconnect that node
    if (oldConnection.connected) {
      this._updateConnection(
        {
          path: {
            input,
            output,
          },
          connected: false,
        },
        false
      );
    }

    let existingEffectsGraph = this._effectGraphsByInputOutput.get(input)!.get(output);
    if (existingEffectsGraph) {
      // initialization check is done externally to this method
      existingEffectsGraph.destroy();
    }

    let effectsGraph = effectGraphState ? new AudioEffectGraph(effectGraphState) : void 0;

    this._effectGraphsByInputOutput.get(input)!.set(output, effectsGraph);

    if (effectsGraph) {
      return new Observable((observer) => {
        effectsGraph!
          .initialize()
          .pipe(
            tap(() => {
              if (oldConnection.connected) {
                this._updateConnection(
                  {
                    path: {
                      input,
                      output,
                    },
                    connected: true,
                  },
                  false
                );
              }
              if (emitEvent) {
                this.emitChange();
              }
            }),
            map(() => undefined)
          )
          .subscribe(() => nextCompleteObserver(observer));
      });
    } else {
      // reconnect if node was previously connected
      if (oldConnection.connected) {
        this._updateConnection(
          {
            path: {
              input,
              output,
            },
            connected: true,
          },
          false
        );
        if (emitEvent) {
          this.emitChange();
        }
      }
      return new Observable((observer) => nextCompleteObserver(observer));
    }
  }

  private _getByRoutingPath<T>(mapByInputOutput: Map<number, Map<number, T>>, routingPath?: Partial<AudioRoutingPath>): Routed<NonNullable<T>>[] {
    let tempResult: Routed<T | undefined>[] = [];

    if (!routingPath || (routingPath.input === void 0 && routingPath.output === void 0)) {
      for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          tempResult.push({object: mapByInputOutput.get(inputNumber)?.get(outputNumber), routingPath: {input: inputNumber, output: outputNumber}});
        }
      }
    } else {
      if (routingPath.input !== void 0 && routingPath.output !== void 0) {
        tempResult.push({object: mapByInputOutput.get(routingPath.input)?.get(routingPath.output), routingPath: {input: routingPath.input, output: routingPath.output}});
      } else if (routingPath.input === void 0 && routingPath.output !== void 0) {
        for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
          tempResult.push({object: mapByInputOutput.get(inputNumber)?.get(routingPath.output), routingPath: {input: inputNumber, output: routingPath.output}});
        }
      } else if (routingPath.input !== void 0 && routingPath.output === void 0) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          tempResult.push({object: mapByInputOutput.get(routingPath.input)?.get(outputNumber), routingPath: {input: routingPath.input, output: outputNumber}});
        }
      }
    }

    return tempResult.filter((tr) => isNonNullable(tr.object)) as Routed<NonNullable<T>>[];
  }

  private connectEffectGraph(effectsGraph: AudioEffectGraph, splitterOutput: number, mergerInput: number) {
    effectsGraph.sourceEffects.forEach((effect) => {
      effect.getInputNodes().forEach((node) => {
        this._channelSplitterNode.connect(node, splitterOutput);
      });
    });
    effectsGraph.destinationEffects.forEach((effect) => {
      effect.getOutputNode().connect(this._channelMergerNode, 0, mergerInput);
    });
  }

  private disconnectEffectGraph(effectsGraph: AudioEffectGraph, splitterOutput: number, mergerInput: number) {
    effectsGraph.sourceEffects.forEach((effect) => {
      effect.getInputNodes().forEach((node) => {
        this._channelSplitterNode.disconnect(node, splitterOutput);
      });
    });
    effectsGraph.destinationEffects.forEach((effect) => {
      effect.getOutputNode().disconnect(this._channelMergerNode, 0, mergerInput);
    });
  }

  destroy() {
    this._destroyBreaker.destroy();

    freeObserver(this._onEvent$);

    try {
      this._channelSplitterNode.disconnect();
      this._channelMergerNode.disconnect();

      this._soloMuteStatesByInput.clear();
      this._connectionsByInputOutput.clear();

      [...this._effectGraphsByInputOutput.values()].forEach((byOutput) => [...byOutput.values()].forEach((effect) => effect?.destroy()));
      this._effectGraphsByInputOutput.clear();
    } catch (e) {
      console.debug(e);
    }
  }
}
