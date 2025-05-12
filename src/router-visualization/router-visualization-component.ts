import {AudioApi} from '../api';
import {OmpAudioRoutingConnection, OmpMainAudioState, OmpSidecarAudioState} from '../video/model';
import {defaultRouterVisualizationLabels, RouterVisualizationSidecarTrack, RouterVisualizationSize, RouterVisualizationTrack} from './router-visualization';

const classes = {
  routerVisualizationTable: 'omakase-router-table',
  routerVisualizationWrapper: 'omakase-router-container',
  routerVisualizationToggle: 'omakase-router-toggle',
};

interface MainTrackConfig {
  track?: RouterVisualizationTrack;
  defaultMatrix?: OmpAudioRoutingConnection[][];
}

interface SidecarTracksConfig {
  tracks: RouterVisualizationSidecarTrack[];
  defaultMatrix?: OmpAudioRoutingConnection[][];
}

type SetNodesAction = 'deselect' | 'reset';

export class RouterVisualizationComponent extends HTMLElement {
  private _outputs?: string[];
  private _mainTrack?: RouterVisualizationTrack;
  private _sidecarTracks?: RouterVisualizationSidecarTrack[];
  private _audio?: AudioApi;
  private _size: RouterVisualizationSize = 'medium';
  private _tableElement!: HTMLTableElement;
  private _wrapperElement!: HTMLDivElement;

  constructor() {
    super();
    this.render();
  }

  set outputs(outputs: string[]) {
    this._outputs = outputs;
    this.renderOutputs();
  }

  get mainTrack(): MainTrackConfig | undefined {
    return {
      track: this._mainTrack,
    };
  }

  set mainTrack(config: MainTrackConfig | undefined) {
    if (!config?.track) {
      this._mainTrack = undefined;
      return;
    }
    this._mainTrack = this.prepareTrackForVisualization(config.track);

    if (!this._audio!.getMainAudioState()?.audioRouterState) {
      this._audio!.createMainAudioRouter(config.track.maxInputNumber, this._outputs!.length).subscribe({
        next: () => {
          this.setAudioRouterDefaultMatrix(config.track!, config.defaultMatrix);
        },
      });
    } else {
      this.setAudioRouterDefaultMatrix(config.track, config.defaultMatrix);
    }
    this.renderTrack(config.track);
  }

  set sidecarTracks(config: SidecarTracksConfig) {
    this._sidecarTracks = config.tracks.map((track) => this.prepareTrackForVisualization(track));

    for (const track of config.tracks) {
      this._audio!.createSidecarAudioRouter(track.trackId, track.maxInputNumber, this._outputs!.length).subscribe({
        next: () => {
          this.setAudioRouterDefaultMatrix(track, config.defaultMatrix);
        },
      });
    }

    for (const track of this._sidecarTracks) {
      this.renderTrack(track, track.trackId);
    }
  }

  set audio(audio: AudioApi) {
    this._audio = audio;

    this._audio.onMainAudioChange$.subscribe((event) => {
      if (event) {
        this.updateTogglesFromState(event.mainAudioState);
      }
    });

    this._audio.onSidecarAudioChange$.subscribe((event) => {
      for (const state of event.sidecarAudioStates) {
        this.updateTogglesFromState(state);
      }
    });

    if (!this._outputs) {
      const outputs = this.getOutputsFromAudioContext(this._audio);
      if (outputs) {
        this.outputs = outputs;
      }
    }
  }

  set size(size: RouterVisualizationSize) {
    this._size = size;
    this._wrapperElement.classList.remove('size-small', 'size-medium', 'size-large');
    this._wrapperElement.classList.add(`size-${this._size}`);
  }

  deselectAllNodes(track?: RouterVisualizationTrack) {
    return this.setAllNodes('deselect', track);
  }

  resetAllNodes(track?: RouterVisualizationTrack) {
    return this.setAllNodes('reset', track);
  }

  private setAudioRouterDefaultMatrix(track: RouterVisualizationTrack | RouterVisualizationSidecarTrack, defaultMatrix?: OmpAudioRoutingConnection[][]) {
    if (defaultMatrix) {
      const initialConnections = this.flattenDefaultMatrix(defaultMatrix);
      if ('trackId' in track) {
        this._audio!.setSidecarAudioRouterInitialRoutingConnections(track.trackId, initialConnections).subscribe(() => this.resetAllNodes(track));
      } else {
        this._audio!.setMainAudioRouterInitialRoutingConnections(initialConnections).subscribe(() => this.resetAllNodes(track));
      }
    }
  }

  private flattenDefaultMatrix(defaultMatrix: OmpAudioRoutingConnection[][]): OmpAudioRoutingConnection[] {
    return defaultMatrix.flatMap((p) => [...p.values()]);
  }

  private render() {
    this._wrapperElement = document.createElement('div');
    this._wrapperElement.classList.add(classes.routerVisualizationWrapper, `size-${this._size}`);

    this._tableElement = document.createElement('table');
    this._tableElement.classList.add(classes.routerVisualizationTable);

    this._wrapperElement.appendChild(this._tableElement);
    this.appendChild(this._wrapperElement);
  }

  private renderOutputs() {
    const existingThead = this._tableElement.getElementsByTagName('thead')[0];
    if (existingThead) {
      this._tableElement.removeChild(existingThead);
    }
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    const th1 = document.createElement('th');
    th1.colSpan = 2;
    th1.classList.add('align-left');
    const deselectAll = document.createElement('span');
    deselectAll.classList.add('omakase-router-icon', 'icon-deselect-all');
    deselectAll.onclick = () => {
      this.deselectAllNodes();
    };
    const resetAll = document.createElement('span');
    resetAll.classList.add('omakase-router-icon', 'icon-reset-all');
    resetAll.onclick = () => {
      this.resetAllNodes();
    };
    th1.append(deselectAll, resetAll);
    tr.appendChild(th1);
    for (const output of this._outputs!) {
      const th = document.createElement('th');
      th.innerHTML = output;
      tr.appendChild(th);
    }
    const th3 = document.createElement('th');
    th3.classList.add('align-right');
    const outputCount = document.createElement('span');
    outputCount.classList.add('omakase-router-icon', `icon-outputs-${this._outputs!.length > 2 ? 'many' : 'few'}`);
    th3.appendChild(outputCount);
    tr.appendChild(th3);
    thead.appendChild(tr);
    this._tableElement.appendChild(thead);
  }

  private renderTrack(track: RouterVisualizationTrack, trackId = 'main') {
    const id = `omakase-router-visualization-${trackId}`;
    const tbody = document.getElementById(id) ?? document.createElement('tbody');

    const routingConnections =
      trackId === 'main'
        ? this._audio!.getMainAudioState()?.audioRouterState?.routingConnections
        : this._audio!.getSidecarAudios()
            .find((audio) => audio.audioTrack.id === trackId)
            ?.audioRouter?.getAudioRouterState()?.routingConnections;

    tbody.innerHTML = '';
    tbody.id = id;
    track.inputLabels!.forEach((input, inputNumber) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.classList.add('align-left');
      if (inputNumber === 0) {
        td1.innerHTML = track.name ?? '';
      } else if (inputNumber === track.inputNumber! - 1) {
        const iconDeselect = document.createElement('span');
        iconDeselect.classList.add('omakase-router-icon', 'icon-deselect');
        iconDeselect.onclick = () => {
          this.deselectAllNodes(track);
        };
        const iconReset = document.createElement('span');
        iconReset.classList.add('omakase-router-icon', 'icon-reset');
        iconReset.onclick = () => {
          this.resetAllNodes(track);
        };
        td1.appendChild(iconDeselect);
        td1.appendChild(iconReset);
      }
      const td2 = document.createElement('td');
      td2.classList.add('align-right');
      td2.innerHTML = input;
      tr.append(td1, td2);
      this._outputs!.forEach((_, outputNumber) => {
        const td = document.createElement('td');
        const toggle = this.getToggleElement();
        toggle.id = `${classes.routerVisualizationToggle}-${trackId}-${inputNumber}-${outputNumber}`;

        if (routingConnections && routingConnections[inputNumber] && routingConnections[inputNumber][outputNumber] && routingConnections[inputNumber][outputNumber].connected) {
          toggle.classList.add('active');
        }
        toggle.onclick = () => {
          const routingConnections: OmpAudioRoutingConnection[] = [
            {
              path: {
                input: inputNumber,
                output: outputNumber,
              },
              connected: !toggle.classList.contains('active'),
            },
          ];
          if (trackId === 'main') {
            this._audio!.updateMainAudioRouterConnections(routingConnections);
          } else {
            this._audio!.updateSidecarAudioRouterConnections(trackId, routingConnections);
          }
        };

        td.appendChild(toggle);
        tr.appendChild(td);
      });
      const td3 = document.createElement('td');
      tr.appendChild(td3);
      tbody.appendChild(tr);
    });
    if (!document.getElementById(id)) {
      this._tableElement.appendChild(tbody);
    }
    if (this._tableElement.getElementsByTagName('tbody').length > 1) {
      this._tableElement.classList.add('omakase-router-multiple');
    }
  }

  private getToggleElement(): HTMLElement {
    const element = document.createElement('div');
    element.classList.add(classes.routerVisualizationToggle);
    const innerElement = document.createElement('div');
    innerElement.classList.add(`${classes.routerVisualizationToggle}-inner`);
    element.appendChild(innerElement);
    return element;
  }

  private setAllNodes(action: SetNodesAction, track?: RouterVisualizationTrack | RouterVisualizationSidecarTrack) {
    if (track) {
      let routingConnections: OmpAudioRoutingConnection[];
      if (action === 'deselect') {
        routingConnections = [...Array(track.inputLabels!.length).keys()].flatMap((input) => {
          return [...Array(this._outputs!.length).keys()].map((output) => ({
            path: {
              input,
              output,
            },
            connected: false,
          }));
        });
      } else {
        if ('trackId' in track) {
          routingConnections = this._audio!.getSidecarAudioRouterInitialRoutingConnections(track.trackId) ?? [];
        } else {
          routingConnections = this._audio!.getMainAudioRouterInitialRoutingConnections() ?? [];
        }
      }

      if ((track as RouterVisualizationSidecarTrack).trackId) {
        this._audio!.updateSidecarAudioRouterConnections((track as RouterVisualizationSidecarTrack).trackId, routingConnections);
      } else {
        this._audio!.updateMainAudioRouterConnections(routingConnections);
      }
    } else {
      if (this._mainTrack) {
        this.setAllNodes(action, this._mainTrack);
      }
      if (this._sidecarTracks) {
        this._sidecarTracks.forEach((track) => {
          this.setAllNodes(action, track);
        });
      }
    }
  }

  private prepareTrackForVisualization<T extends RouterVisualizationTrack | RouterVisualizationSidecarTrack>(track: T): T {
    if (!track.inputNumber) {
      track.inputNumber = track.maxInputNumber;
    }
    if (!track.inputLabels || track.inputLabels.length !== track.inputNumber) {
      track.inputLabels = defaultRouterVisualizationLabels.slice(0, track.inputNumber);
    } else {
      track.inputLabels = track.inputLabels.slice(0, track.inputNumber);
    }
    return track;
  }

  private getOutputsFromAudioContext(audio: AudioApi): string[] | undefined {
    const outputCount = audio.getAudioContext()?.destination.maxChannelCount;
    if (outputCount && outputCount >= 6) {
      return defaultRouterVisualizationLabels.slice(0, 6);
    } else if (outputCount && outputCount >= 2) {
      return defaultRouterVisualizationLabels.slice(0, 2);
    } else {
      return undefined;
    }
  }

  private updateTogglesFromState(state: OmpMainAudioState | OmpSidecarAudioState) {
    const trackId = (state as OmpSidecarAudioState).audioTrack?.id ?? 'main';
    if (state.audioRouterState) {
      state.audioRouterState.routingConnections.forEach((connections) => {
        connections.forEach((connection) => {
          if (connection.connected) {
            document.getElementById(`${classes.routerVisualizationToggle}-${trackId}-${connection.path.input}-${connection.path.output}`)?.classList.add('active');
          } else {
            document.getElementById(`${classes.routerVisualizationToggle}-${trackId}-${connection.path.input}-${connection.path.output}`)?.classList.remove('active');
          }
        });
      });
    }
  }
}
