/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {Destroyable, OmpAudioRouterChangeEvent, OmpAudioRouterInputSoloMuteEvent, OmpError} from '../types';
import {forkJoin, map, Observable, ReplaySubject, Subject, tap} from 'rxjs';
import {OmpAudioRouterInputSoloMuteState, OmpAudioRouterState, OmpAudioRoutingConnection, OmpAudioRoutingInputType, OmpAudioRoutingPath, OmpAudioRoutingRoute} from './model';
import {Validators} from '../validators';
import {AudioUtil} from '../util/audio-util';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {AudioRouterApi} from '../api/audio-router-api';
import {OmpAudioEffect, OmpAudioEffectFilter, OmpAudioEffectParam, OmpAudioEffectsGraph, OmpAudioEffectsGraphDef} from '../audio';
import {isNonNullable} from '../util/function-util';

export class OmpAudioRouter implements AudioRouterApi, Destroyable {
  public readonly onChange$: Subject<OmpAudioRouterChangeEvent> = new Subject<OmpAudioRouterChangeEvent>();
  public readonly onInputSoloMute$: Subject<OmpAudioRouterInputSoloMuteEvent> = new Subject<OmpAudioRouterInputSoloMuteEvent>();

  protected _audioContext: AudioContext;
  protected _inputsNumber: number;
  protected _outputsNumber: number;

  protected _sourceAudioNode?: AudioNode;
  protected _channelSplitterNode: ChannelSplitterNode;
  protected _channelMergerNode: ChannelMergerNode;

  protected _initialRoutingConnections: OmpAudioRoutingConnection[];
  /**
   * Mapped by routing path input, then by routing path output
   * @protected
   */
  protected _connectionsByInputOutput: Map<number, Map<number, OmpAudioRoutingConnection>>;
  protected _effectsGraphsByInputOutput: Map<number, Map<number, OmpAudioEffectsGraph | undefined>>;

  protected _lastChangedSoloMuteStateInput: number | undefined;
  /**
   * Mapped input states, stores solo and mute flag/connections for each input
   * @protected
   */
  protected _soloMuteStatesByInput: Map<number, OmpAudioRouterInputSoloMuteState>;

  protected _destroyed$ = new Subject<void>();

  protected static readonly defaultAudioOutputsResolver: (maxChannelCount: number) => number = (maxChannelCount: number) => {
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

  constructor(audioContext: AudioContext, audioOutputNode: AudioNode, inputsNumber: number, outputsNumberResolver?: (maxChannelCount: number) => number) {
    this._audioContext = audioContext;
    let maxChannelCount = this._audioContext.destination.maxChannelCount; // the maximum number of channels that this hardware is capable of supporting

    inputsNumber = Validators.audioChannelsNumber()(inputsNumber);

    this._inputsNumber = inputsNumber;
    if (outputsNumberResolver) {
      this._outputsNumber = outputsNumberResolver(maxChannelCount);
    } else {
      this._outputsNumber = OmpAudioRouter.defaultAudioOutputsResolver(maxChannelCount);
    }

    this._initialRoutingConnections = AudioUtil.resolveDefaultAudioRouting(this._inputsNumber, this._outputsNumber);

    this._channelSplitterNode = this._audioContext.createChannelSplitter(this._inputsNumber);
    this._channelMergerNode = this._audioContext.createChannelMerger(this._outputsNumber);

    this._connectionsByInputOutput = new Map<number, Map<number, OmpAudioRoutingConnection>>();
    this._effectsGraphsByInputOutput = new Map<number, Map<number, OmpAudioEffectsGraph>>();

    this._soloMuteStatesByInput = new Map<number, OmpAudioRouterInputSoloMuteState>();

    for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
      let connectionsByOutput: Map<number, OmpAudioRoutingConnection> = new Map<number, OmpAudioRoutingConnection>();
      this._connectionsByInputOutput.set(inputNumber, connectionsByOutput);

      let inputEffectsGraphsByOutput: Map<number, OmpAudioEffectsGraph> = new Map<number, OmpAudioEffectsGraph>();
      this._effectsGraphsByInputOutput.set(inputNumber, inputEffectsGraphsByOutput);

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

    this.resetInputsSoloMuteState();

    this.updateConnections(this.getInitialRoutingConnections());

    // connect silent gain node to prevent buffer overflows and stalls when audio isn't routed to destination
    let silentGainNode = this._audioContext.createGain();
    silentGainNode.gain.value = 0; // Set gain to 0 (silent)
    silentGainNode.connect(audioOutputNode);
    this._channelSplitterNode.connect(silentGainNode);

    this._channelMergerNode.connect(audioOutputNode);

    this.emitChange();
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

  updateConnections(connections: OmpAudioRoutingConnection[]): void {
    connections.forEach((p) => this._updateConnection(p, false));

    this._updateInputsSoloMuteState();

    this.emitChange();
  }

  getInitialRoutingConnections(): OmpAudioRoutingConnection[] {
    return this._initialRoutingConnections;
  }

  private getInputInitialRoutingConnections(inputNumber: number): OmpAudioRoutingConnection[] {
    return this._initialRoutingConnections.filter((p) => p.path.input === inputNumber);
  }

  private getRoutingConnections(): OmpAudioRoutingConnection[][] {
    return [...this._connectionsByInputOutput.values()].map((p) => [...p.values()]);
  }

  get sourceAudioNode(): AudioNode | undefined {
    return this._sourceAudioNode;
  }

  get inputsNumber(): number {
    return this._inputsNumber;
  }

  get outputsNumber(): number {
    return this._outputsNumber;
  }

  getAudioRouterState(): OmpAudioRouterState {
    let routingRoutes: OmpAudioRoutingRoute[] = [];
    for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
      for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
        let routingRoute: OmpAudioRoutingRoute = {
          path: {
            input: inputNumber,
            output: outputNumber,
          },
          connection: {
            ...this._connectionsByInputOutput.get(inputNumber)!.get(outputNumber)!,
          },
          audioEffectsGraph: this._effectsGraphsByInputOutput.get(inputNumber)?.get(outputNumber)?.toDef(),
        };
        routingRoutes.push(routingRoute);
      }
    }

    return {
      inputsNumber: this._inputsNumber,
      outputsNumber: this._outputsNumber,
      routingConnections: this.getRoutingConnections(),
      routingRoutes: routingRoutes,
      initialRoutingConnections: this._initialRoutingConnections,
    };
  }

  getAudioRouterInputSoloMuteState(): OmpAudioRouterInputSoloMuteState {
    if (this._lastChangedSoloMuteStateInput === void 0) {
      throw new Error('Solo/mute is undefined');
    }

    return this._soloMuteStatesByInput.get(this._lastChangedSoloMuteStateInput)!;
  }

  toggleSolo(routingPath: OmpAudioRoutingInputType) {
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
  }

  toggleMute(routingPath: OmpAudioRoutingInputType) {
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

      this.emitChange();
    } else {
      const inputState = this._soloMuteStatesByInput.get(routingPath.input);
      if (inputState && inputState.muted) {
        this._unmute(routingPath.input);
      } else {
        this._mute(routingPath.input);
      }

      this.emitChange();
    }
  }

  setAudioEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    return this._setEffectsGraphs(effectsGraphDef, routingPath);
  }

  removeAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>) {
    this._setEffectsGraphs(void 0, routingPath);
  }

  findAudioEffectsGraphs(routingPath?: Partial<OmpAudioRoutingPath>): OmpAudioEffectsGraph[] {
    return this.getByRoutingPath(this._effectsGraphsByInputOutput, routingPath);
  }

  findAudioEffects(filter?: {routingPath?: Partial<OmpAudioRoutingPath>} & OmpAudioEffectFilter): OmpAudioEffect[] {
    let audioEffectsGraphs = this.findAudioEffectsGraphs(filter?.routingPath);
    return audioEffectsGraphs.flatMap((audioEffectsGraph) => {
      return audioEffectsGraph.findAudioEffects({id: filter?.id, effectType: filter?.effectType, attrs: filter?.attrs});
    });
  }

  setAudioEffectsParams(
    param: OmpAudioEffectParam,
    filter?: {
      routingPath?: Partial<OmpAudioRoutingPath>;
    } & OmpAudioEffectFilter
  ) {
    let effects = this.findAudioEffects(filter);
    effects.forEach((effect) => {
      effect.setParam(param);
    });
    this.emitChange();
  }

  resetInputsSoloMuteState(): void {
    [...Array(this._inputsNumber).keys()].forEach((inputNumber) => {
      this.resetInputSoloMuteState(inputNumber);
    });
  }

  protected resetInputSoloMuteState(inputNumber: number): void {
    this.setInputSoloMuteState(inputNumber, this.createInitialSoloMuteState(inputNumber));
  }

  protected createInitialSoloMuteState(inputNumber: number): OmpAudioRouterInputSoloMuteState {
    return {
      inputNumber,
      inputSoloedConnections: [],
      inputMutedConnections: [],
      unsoloConnections: [],
      soloed: false,
      muted: false,
    };
  }

  setInitialRoutingConnections(connections: OmpAudioRoutingConnection[]): void {
    if (connections.length !== this._inputsNumber * this._outputsNumber) {
      console.error("Initial routing connections length doesn't match router's inputs and outputs number");
    } else {
      this._initialRoutingConnections = connections;
      this.emitChange();
    }
  }

  private getByRoutingPath<T>(mapByInputOutput: Map<number, Map<number, T>>, routingPath?: Partial<OmpAudioRoutingPath>): NonNullable<T>[] {
    let tempResult: (T | undefined)[] = [];

    if (!routingPath || (routingPath.input === void 0 && routingPath.output === void 0)) {
      for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          tempResult.push(mapByInputOutput.get(inputNumber)?.get(outputNumber));
        }
      }
    } else {
      if (routingPath.input !== void 0 && routingPath.output !== void 0) {
        tempResult.push(mapByInputOutput.get(routingPath.input)?.get(routingPath.output));
      } else if (routingPath.input === void 0 && routingPath.output !== void 0) {
        for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
          tempResult.push(mapByInputOutput.get(inputNumber)?.get(routingPath.output));
        }
      } else if (routingPath.input !== void 0 && routingPath.output === void 0) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          tempResult.push(mapByInputOutput.get(routingPath.input)?.get(outputNumber));
        }
      }
    }

    return tempResult.filter(isNonNullable);
  }

  protected emitChange() {
    this.onChange$.next({
      audioRouterState: this.getAudioRouterState(),
    });
  }

  protected emitInputSoloMute() {
    this.onInputSoloMute$.next({
      audioRouterInputSoloMuteState: this.getAudioRouterInputSoloMuteState(),
    });
  }

  protected _updateConnection(newConnection: OmpAudioRoutingConnection, emitEvent = true) {
    if (!this._connectionsByInputOutput.has(newConnection.path.input)) {
      console.debug(`Unknown routing path: ${JSON.stringify(newConnection)}`);
      return;
    }

    if (this._channelSplitterNode && this._channelMergerNode) {
      let byOutput = this._connectionsByInputOutput.get(newConnection.path.input)!;
      let existingConnection = byOutput.get(newConnection.path.output);

      let audioGraphByOutput = this._effectsGraphsByInputOutput.get(newConnection.path.input)!;
      let audioGraph = audioGraphByOutput.get(newConnection.path.output);

      // change is required only if newNode doesn't exist already and is connected, or if it exists and new connected state differs from existing
      let connectionChanged = (!existingConnection && newConnection.connected) || (existingConnection && existingConnection.connected !== newConnection.connected);

      if (connectionChanged) {
        try {
          if (newConnection.connected) {
            if (audioGraph) {
              this.connectEffectsGraph(audioGraph, newConnection.path.input, newConnection.path.output);
            } else {
              this._channelSplitterNode.connect(this._channelMergerNode, newConnection.path.input, newConnection.path.output);
            }
          } else {
            if (audioGraph) {
              this.disconnectEffectsGraph(audioGraph, newConnection.path.input, newConnection.path.output);
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

  protected _solo(inputNumber: number) {
    const inputSoloedState = [...this._soloMuteStatesByInput.values()].find((inputState) => inputState.soloed);
    if (inputSoloedState) {
      this._unsolo(inputSoloedState.inputNumber, false);
    }

    let routingConnections = this.getRoutingConnections();
    let inputSoloedConnections = routingConnections[inputNumber];
    if (!inputSoloedConnections.filter((connection) => connection.connected).length) {
      const inputState = this._soloMuteStatesByInput.get(inputNumber);
      if (inputState && inputState.inputMutedConnections?.length) {
        inputSoloedConnections = inputState.inputMutedConnections;
      } else {
        const inputInitialRoutingConnections = this.getInputInitialRoutingConnections(inputNumber);
        if (inputInitialRoutingConnections.filter((connection) => connection.connected).length) {
          inputSoloedConnections = inputInitialRoutingConnections;
        } else {
          inputSoloedConnections = AudioUtil.resolveDefaultInputAudioRouting(inputNumber, this._inputsNumber, this._outputsNumber);
        }
      }
      inputSoloedConnections.forEach((connection) => {
        this._updateConnection(connection, false);
      });
    }

    routingConnections.forEach((connections, index) => {
      if (index !== inputNumber) {
        connections.forEach((connection) => {
          const newConnection: OmpAudioRoutingConnection = {
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
        this.emitInputSoloMute();
      }
    });

    this.setInputSoloMuteState(inputNumber, {
      inputNumber,
      inputSoloedConnections,
      inputMutedConnections: this._soloMuteStatesByInput.get(inputNumber)?.inputMutedConnections ?? [],
      unsoloConnections: routingConnections.filter((_, index) => index !== inputNumber).flatMap((p) => [...p.values()]),
      soloed: true,
      muted: false,
    });
  }

  protected _unsolo(inputNumber: number, checkMute = true) {
    const inputState = this._soloMuteStatesByInput.get(inputNumber)!;
    if (inputState.unsoloConnections.length) {
      inputState.unsoloConnections.forEach((connection) => {
        this._updateConnection(connection, false);
      });
    } else {
      this.getInputInitialRoutingConnections(inputNumber)
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

  protected _mute(inputNumber: number) {
    const inputState = this._soloMuteStatesByInput.get(inputNumber);
    const routingConnections = this.getRoutingConnections();
    let inputMutedConnections: OmpAudioRoutingConnection[];
    if (inputState && inputState.inputMutedConnections.length) {
      inputMutedConnections = inputState.inputMutedConnections;
    } else {
      const filteredConnections = routingConnections[inputNumber].filter((connection) => connection.connected);
      if (filteredConnections.length) {
        inputMutedConnections = routingConnections[inputNumber];
      } else {
        inputMutedConnections = [];
      }
    }

    inputMutedConnections.forEach((connection) => {
      const newConnection: OmpAudioRoutingConnection = {
        ...connection,
        connected: false,
      };
      this._updateConnection(newConnection, false);
    });

    this.setInputSoloMuteState(inputNumber, {
      ...this.createInitialSoloMuteState(inputNumber),
      inputMutedConnections,
      muted: true,
    });
  }

  protected _unmute(inputNumber: number) {
    const inputState = this._soloMuteStatesByInput.get(inputNumber);
    if (inputState && inputState.inputMutedConnections.length) {
      inputState.inputMutedConnections.forEach((connection) => {
        this._updateConnection(connection, false);
      });
    } else {
      const inputInitialRoutingConnections = this.getInputInitialRoutingConnections(inputNumber).filter((connection) => connection.connected);
      if (inputInitialRoutingConnections.length) {
        inputInitialRoutingConnections.forEach((connection) => {
          this._updateConnection(connection, false);
        });
      } else {
        AudioUtil.resolveDefaultInputAudioRouting(inputNumber, this._inputsNumber, this._outputsNumber).forEach((connection) => {
          this._updateConnection(connection, false);
        });
      }
    }

    this.resetInputSoloMuteState(inputNumber);
  }

  protected _updateInputsSoloMuteState() {
    const routingConnections = this.getRoutingConnections();
    let inputSoloedState = [...this._soloMuteStatesByInput.values()].find((inputState) => inputState.soloed);

    if (inputSoloedState) {
      for (let inputNumber = 0; inputNumber < routingConnections.length; inputNumber++) {
        const filteredConnections = routingConnections[inputNumber].filter((connection) => connection.connected);
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

  private setInputSoloMuteState(inputNumber: number, state: OmpAudioRouterInputSoloMuteState) {
    this._lastChangedSoloMuteStateInput = inputNumber;
    this._soloMuteStatesByInput.set(inputNumber, state);
    this.emitInputSoloMute();
  }

  private connectEffectsGraph(effectsGraph: OmpAudioEffectsGraph, splitterOutput: number, mergerInput: number) {
    effectsGraph.sourceEffects.forEach((effect) => {
      effect.getInputNodes().forEach((node) => {
        this._channelSplitterNode.connect(node, splitterOutput);
      });
    });
    effectsGraph.destinationEffects.forEach((effect) => {
      effect.getOutputNode().connect(this._channelMergerNode, 0, mergerInput);
    });
  }

  private disconnectEffectsGraph(effectsGraph: OmpAudioEffectsGraph, splitterOutput: number, mergerInput: number) {
    effectsGraph.sourceEffects.forEach((effect) => {
      effect.getInputNodes().forEach((node) => {
        this._channelSplitterNode.disconnect(node, splitterOutput);
      });
    });
    effectsGraph.destinationEffects.forEach((effect) => {
      effect.getOutputNode().disconnect(this._channelMergerNode, 0, mergerInput);
    });
  }

  private _checkIfEffectsGraphsCanBeChanged(routingPath?: Partial<OmpAudioRoutingPath>) {
    if (!routingPath || (routingPath.input === void 0 && routingPath.output === void 0)) {
      for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const effectsGraph = this._effectsGraphsByInputOutput.get(inputNumber)?.get(outputNumber);
          if (effectsGraph && !effectsGraph.initialized) {
            return false;
          }
        }
      }
    } else {
      if (routingPath.input !== void 0 && routingPath.output !== void 0) {
        const effectsGraph = this._effectsGraphsByInputOutput.get(routingPath.input)?.get(routingPath.output);
        if (effectsGraph && !effectsGraph.initialized) {
          return false;
        }
      } else if (routingPath.input === void 0 && routingPath.output !== void 0) {
        for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
          const effectsGraph = this._effectsGraphsByInputOutput.get(inputNumber)?.get(routingPath.output);
          if (effectsGraph && !effectsGraph.initialized) {
            return false;
          }
        }
      } else if (routingPath.input !== void 0 && routingPath.output === void 0) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const effectsGraph = this._effectsGraphsByInputOutput.get(routingPath.input)?.get(outputNumber);
          if (effectsGraph && !effectsGraph.initialized) {
            return false;
          }
        }
      }
    }

    return true;
  }
  private _setEffectsGraphs(effectsGraphDef: OmpAudioEffectsGraphDef | undefined, routingPath?: Partial<OmpAudioRoutingPath>): Observable<void> {
    if (!this._checkIfEffectsGraphsCanBeChanged(routingPath)) {
      throw new OmpError(`Effects can't be changed before initialization finishes on routing path ${routingPath}`);
    }
    const allReady$: Observable<void>[] = [];
    if (!routingPath || (routingPath.input === void 0 && routingPath.output === void 0)) {
      for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const ready$ = this._setEffectsGraph(effectsGraphDef, inputNumber, outputNumber, false);
          allReady$.push(ready$);
        }
      }
    } else {
      if (routingPath.input !== void 0 && routingPath.output !== void 0) {
        const ready$ = this._setEffectsGraph(effectsGraphDef, routingPath.input, routingPath.output, false);
        allReady$.push(ready$);
      } else if (routingPath.input === void 0 && routingPath.output !== void 0) {
        // set on all input's and given output
        for (let inputNumber = 0; inputNumber < this._inputsNumber; inputNumber++) {
          const ready$ = this._setEffectsGraph(effectsGraphDef, inputNumber, routingPath.output, false);
          allReady$.push(ready$);
        }
      } else if (routingPath.input !== void 0 && routingPath.output === void 0) {
        // set on all output's and given input
        for (let outputNumber = 0; outputNumber < this._outputsNumber; outputNumber++) {
          const ready$ = this._setEffectsGraph(effectsGraphDef, routingPath.input, outputNumber, false);
          allReady$.push(ready$);
        }
      }
    }

    return new Observable((observer) => {
      forkJoin(allReady$).subscribe(() => nextCompleteObserver(observer));
      this.emitChange();
    });
  }

  private _setEffectsGraph(effectsGraphDef: OmpAudioEffectsGraphDef | undefined, input: number, output: number, emitEvent = true): Observable<void> {
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

    let existingEffectsGraph = this._effectsGraphsByInputOutput.get(input)!.get(output);
    if (existingEffectsGraph) {
      // initialization check is done externally to this method
      existingEffectsGraph.destroy();
    }

    let effectsGraph = effectsGraphDef ? new OmpAudioEffectsGraph(this._audioContext, effectsGraphDef) : void 0;

    this._effectsGraphsByInputOutput.get(input)!.set(output, effectsGraph);

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

  destroy(): void {
    try {
      if (this._sourceAudioNode) {
        this._sourceAudioNode.disconnect();
      }

      this._channelSplitterNode.disconnect();
      this._channelMergerNode.disconnect();

      completeUnsubscribeSubjects(this.onChange$);
      completeUnsubscribeSubjects(this.onInputSoloMute$);

      nextCompleteSubject(this._destroyed$);

      this._connectionsByInputOutput.clear();
      this._effectsGraphsByInputOutput.clear();

      this._lastChangedSoloMuteStateInput = void 0;
      this._soloMuteStatesByInput.clear();

      [...this._effectsGraphsByInputOutput.values()].forEach((byOutput) => [...byOutput.values()].forEach((effect) => effect?.destroy()));
    } catch (e) {
      console.debug(e);
    }
  }
}
