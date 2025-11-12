/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {OmakasePlayer} from '../src';
import {ReplaySubject} from 'rxjs';

export class OmpTremoloEffect {
  constructor(audioContext, def) {
    this._def = def;
    this.id = def.id;
    this.effectType = def.effectType;
    this.attrs = new Map();
    this.onReady$ = new ReplaySubject(1);

    const rate = this._extractParamFromDef('rate', 5);
    const depth = this._extractParamFromDef('depth', 0.5);

    this._inputGain = new GainNode(audioContext, {gain: 1.0});
    this._lfo = new OscillatorNode(audioContext, {type: 'sine', frequency: rate});
    this._lfoGain = new GainNode(audioContext, {gain: depth});

    this._lfo.connect(this._lfoGain).connect(this._inputGain.gain);
    this._lfo.start();

    if (def.attrs) {
      for (const [key, value] of Object.entries(def.attrs)) {
        this.attrs.set(key, value);
      }
    }

    this.onReady$.next();
  }

  _extractParamFromDef(name, defaultValue) {
    return this._def.audioParams?.find((param) => param.name === name)?.props[0].value ?? defaultValue;
  }

  getInputNodes() {
    return [this._inputGain];
  }

  getOutputNode() {
    return this._inputGain;
  }

  getNodes() {
    return [this._inputGain, this._lfo, this._lfoGain];
  }

  getParams() {
    return this._def.audioParams;
  }

  toDef() {
    return {...this._def};
  }

  setParam(param) {
    if (!param.props.length) return;

    const prop = param.props[0];
    if (!Number.isFinite(prop.value)) return;

    const {name} = param;
    const value = prop.value;

    if (name === 'rate') {
      this._lfo.frequency.setTargetAtTime(value, this._lfo.context.currentTime, 0.01);
    } else if (name === 'depth') {
      this._lfoGain.gain.setTargetAtTime(value, this._lfo.context.currentTime, 0.01);
    }

    this._updateDefParam(param);
  }

  _updateDefParam(param) {
    if (!this._def.audioParams) {
      this._def.audioParams = [param];
      return;
    }

    const existing = this._def.audioParams.find((p) => p.name === param.name);
    if (existing) {
      existing.props = param.props;
    } else {
      this._def.audioParams.push(param);
    }
  }

  destroy() {
    try {
      this._lfo.stop();
      this._inputGain.disconnect();
      this._lfo.disconnect();
      this._lfoGain.disconnect();
    } catch (e) {
      console.warn('Error destroying OmpTremoloEffect:', e);
    }
  }

  static createDef(id, rate, depth, connections, attrs) {
    return {
      id,
      effectType: 'tremolo',
      connections,
      attrs,
      audioParams: [
        {
          name: 'rate',
          props: [{name: 'value', value: rate}],
        },
        {
          name: 'depth',
          props: [{name: 'value', value: depth}],
        },
      ],
    };
  }
}

window.addEventListener('load', () => {
  let omakasePlayer = new OmakasePlayer({
    playerHTMLElementId: 'omakase-player1',
    detachedPlayer: true,
    audioPlayMode: 'multiple',
    mediaChrome: {
      visibility: 'enabled',
      trackMenuFloating: true,
    },
    hlsConfig: {
      // debug: true,
      emeEnabled: true,
      enableWorker: false,
      drmSystems: {
        'com.microsoft.playready': {
          licenseUrl: 'https://lic.drmtoday.com/license-proxy-headerauth/drmtoday/RightsManager.asmx',
        },
        'com.widevine.alpha': {
          licenseUrl: 'https://lic.drmtoday.com/license-proxy-widevine/cenc/',
        },
        'com.apple.fps': {
          licenseUrl: 'https://lic.staging.drmtoday.com/license-server-fairplay/',
          serverCertificateUrl: 'https://lic.staging.drmtoday.com/license-server-fairplay/cert/konstruktconsulting',
        },
      },
      // licenseXhrSetup: (xhr) => {
      //   let jwttoken = new URLSearchParams(new URL(window.location.href).search).get('drmjwttoken')
      //
      //   xhr.setRequestHeader(
      //     'x-dt-auth-token',
      //     jwttoken
      //   );
      // },
      licenseResponseCallback: (xhr, url, keyContext) => {
        let base64Decode = (base64encodedStr) => {
          return Uint8Array.from(atob(base64encodedStr), (c) => c.charCodeAt(0));
        };
        const response = xhr.response;
        if (keyContext.keySystem === 'com.apple.fps') {
          try {
            let decodedResponse = base64Decode(new TextDecoder().decode(response).trim());
            return decodedResponse.buffer;
          } catch (error) {
            console.error(error);
          }
        }
        return response;
      },
      loadVideoLicenseXhrSetup: (sourceUrl, options) => {
        return (xhr) => {
          console.log('zovem u detachanom', options);

          // dohvati mi token preko http-a
          // if token istekao, napravi nesto

          if (options.data && options.data['DRMTOKEN']) {
            xhr.setRequestHeader('x-dt-auth-token', options.data['DRMTOKEN']);
          } else {
            console.log('drm token missing :(');
          }
        };
      },
    },
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      if (event.target === document.body) {
        event.preventDefault(); // prevents scrolling
        omakasePlayer.video.togglePlayPause().subscribe();
      }
    }

    if (event.code === 'ArrowLeft') {
      if (event.target === document.body) {
        event.preventDefault();
        omakasePlayer.video.seekPreviousFrame().subscribe(() => {});
      }
    }

    if (event.code === 'ArrowRight') {
      if (event.target === document.body) {
        event.preventDefault();
        omakasePlayer.video.seekNextFrame().subscribe(() => {});
      }
    }
  });

  omakasePlayer.audio.registerAudioEffect('tremolo', (ctx, def) => new OmpTremoloEffect(ctx, def));

  window.omp = omakasePlayer; // for console debugging
});
