import {AudioApi} from '../api';
import {AudioInputOutputNode, OmpMainAudioState, OmpSidecarAudioState} from '../video/model';
import {defaultRouterVisualizationLabels, RouterVisualizationSidecarTrack, RouterVisualizationSize, RouterVisualizationTrack} from './router-visualization';

const classes = {
  routerVisualizationTable: 'omakase-router-table',
  routerVisualizationWrapper: 'omakase-router-container',
  routerVisualizationToggle: 'omakase-router-toggle',
};

export class RouterVisualizationComponent extends HTMLElement {
  private _outputs?: string[];
  private _mainTrack?: RouterVisualizationTrack;
  private _sidecarTracks?: RouterVisualizationSidecarTrack[];
  private _audio?: AudioApi;
  private _size: RouterVisualizationSize = 'medium';
  private _defaultMatrix?: AudioInputOutputNode[][];
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

  get mainTrack(): RouterVisualizationTrack | undefined {
    return this._mainTrack;
  }

  set mainTrack(track: RouterVisualizationTrack | undefined) {
    if (!track) {
      this._mainTrack = undefined;
      return;
    }
    this._mainTrack = this.prepareTrackForVisualization(track);

    if (!this._audio!.getMainAudioState()?.audioRouterState?.audioInputOutputNodes.length) {
      this._audio!.createMainAudioRouter(track.maxInputNumber, this._outputs!.length);
    }
    this.renderTrack(track);
  }

  set sidecarTracks(tracks: RouterVisualizationSidecarTrack[]) {
    this._sidecarTracks = tracks.map((track) => this.prepareTrackForVisualization(track));

    for (const track of tracks) {
      this._audio!.createSidecarAudioRouter(track.trackId, track.maxInputNumber, this._outputs!.length);
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

  set defaultMatrix(defaultMatrix: AudioInputOutputNode[][] | undefined) {
    this._defaultMatrix = defaultMatrix;
    setTimeout(() => {
      this.resetAllNodes();
    });
  }

  deselectAllNodes(track?: RouterVisualizationTrack) {
    return this.setAllNodes(track, (_inputNumber, _outputNumber) => false);
  }

  resetAllNodes(track?: RouterVisualizationTrack) {
    return this.setAllNodes(track, (inputNumber, outputNumber) => {
      if (this._defaultMatrix) {
        return this._defaultMatrix[inputNumber][outputNumber].connected ?? false;
      } else if (this._outputs!.length === 2) {
        return inputNumber === 2 || inputNumber === outputNumber || inputNumber - 4 === outputNumber;
      } else {
        return inputNumber === outputNumber;
      }
    });
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

    const inputOutputNodes =
      trackId === 'main'
        ? this._audio!.getMainAudioState()?.audioRouterState?.audioInputOutputNodes
        : this._audio!.getSidecarAudios()
            .find((audio) => audio.audioTrack.id === trackId)
            ?.audioRouter?.getAudioRouterState()?.audioInputOutputNodes;

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

        if (inputOutputNodes && inputOutputNodes[inputNumber] && inputOutputNodes[inputNumber][outputNumber] && inputOutputNodes[inputNumber][outputNumber].connected) {
          toggle.classList.add('active');
        }
        toggle.onclick = () => {
          const newAudioInputOutputNodes = [
            {
              inputNumber,
              outputNumber,
              connected: !toggle.classList.contains('active'),
            },
          ];
          if (trackId === 'main') {
            this._audio!.routeMainAudioRouterNodes(newAudioInputOutputNodes);
          } else {
            this._audio!.routeSidecarAudioRouterNodes(trackId, newAudioInputOutputNodes);
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

  private setAllNodes(track?: RouterVisualizationTrack | RouterVisualizationSidecarTrack, connectedFn?: (inputNumber: number, outputNumber: number) => boolean) {
    if (track) {
      track.inputLabels!.forEach((_, inputNumber) => {
        this._outputs!.forEach((_, outputNumber) => {
          const newAudioInputOutputNodes = [
            {
              inputNumber,
              outputNumber,
              connected: connectedFn ? connectedFn(inputNumber, outputNumber) : false,
            },
          ];
          if ((track as RouterVisualizationSidecarTrack).trackId) {
            this._audio!.routeSidecarAudioRouterNodes((track as RouterVisualizationSidecarTrack).trackId, newAudioInputOutputNodes);
          } else {
            this._audio!.routeMainAudioRouterNodes(newAudioInputOutputNodes);
          }
        });
      });
    } else {
      if (this._mainTrack) {
        this.setAllNodes(this._mainTrack, connectedFn);
      }
      if (this._sidecarTracks) {
        this._sidecarTracks.forEach((track) => this.setAllNodes(track, connectedFn));
      }
    }
  }

  private prepareTrackForVisualization<T extends RouterVisualizationTrack | RouterVisualizationSidecarTrack>(track: T): T {
    if (!track.inputNumber) {
      track.inputNumber = track.maxInputNumber;
    }
    if (!track.inputLabels) {
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
    if (state.audioRouterState?.audioInputOutputNodes.length) {
      state.audioRouterState.audioInputOutputNodes.forEach((inputs) => {
        inputs.forEach((node) => {
          if (node.connected) {
            document.getElementById(`${classes.routerVisualizationToggle}-${trackId}-${node.inputNumber}-${node.outputNumber}`)?.classList.add('active');
          } else {
            document.getElementById(`${classes.routerVisualizationToggle}-${trackId}-${node.inputNumber}-${node.outputNumber}`)?.classList.remove('active');
          }
        });
      });
    }
  }
}
