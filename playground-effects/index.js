/*
 * Copyright 2024 ByOmakase, LLC
 * Licensed under the Apache License, Version 2.0
 */

import {ReplaySubject} from 'rxjs';
import {OmakasePlayer, DefaultOmpAudioEffectsGraphDef, OmpGainEffect, OmpDelayEffect} from '../src';

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

    setTimeout(() => {
      this.onReady$.next();
    }, 100);
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
  let omp = new OmakasePlayer({
    playerHTMLElementId: 'omakase-player1',
    detachedPlayerUrlFn: (video, videoLoadOptions) => {
      return `http://localhost:5173/playground-effects/detached.html`;
    },
    audioPlayMode: 'multiple',
    playerChroming: {
      theme: 'DEFAULT',
      themeConfig: {controlBarVisibility: 'ENABLED'},
    },
    disablePictureInPicture: true,
  });

  omp.audio.registerAudioEffect('tremolo', (ctx, def) => new OmpTremoloEffect(ctx, def));
  let echoEffect = DefaultOmpAudioEffectsGraphDef.create(
    OmpGainEffect.createDef('gain1', 1).outputTo({effectId: 'delay1'}),
    OmpDelayEffect.createDef('delay1', 0.2).outputTo('feedbackGain', 'gain2'),
    OmpGainEffect.createDef('feedbackGain', 0.5).outputTo('delay1'),
    OmpGainEffect.createDef('gain2', 1)
  );

  let tremoloEffect = DefaultOmpAudioEffectsGraphDef.create(OmpTremoloEffect.createDef('tremolo', 5, 5));

  let crazyEffect = DefaultOmpAudioEffectsGraphDef.create(
    OmpGainEffect.createDef('gain1', 1).outputTo({effectId: 'delay1'}),
    OmpDelayEffect.createDef('delay1', 0.2).outputTo('feedbackGain', 'gain2'),
    OmpGainEffect.createDef('feedbackGain', 0.5).outputTo('delay1'),
    OmpGainEffect.createDef('gain2', 1).outputTo('tremolo1'),
    OmpTremoloEffect.createDef('tremolo1', 5, 5)
  );

  let effectsMap = new Map();
  effectsMap.set('echo', echoEffect);
  effectsMap.set('tremolo', tremoloEffect);
  effectsMap.set('crazy', crazyEffect);

  let idMap = new Map([
    ['sidecar1-section', 'sc0'],
    ['sidecar2-section', 'sc1'],
  ]);

  const dataset = {
    id: 'test',
    video: {
      url: 'https://demo.player.byomakase.org/data/sdr-ts/meridian_sdr.m3u8',
    },
    audio: [
      {url: 'https://media.assets.byomakase.org/stems/sidecar-audio/adts/meridian_aac-lc_aud20t1c1-2hr_11m58s.aac', label: 'Sidecar 1', active: false},
      {url: 'https://media.assets.byomakase.org/stems/sidecar-audio/adts/meridian_aac-lc_aud20t1c1-2fr_11m58s.aac', label: 'Sidecar 2', active: false},
    ],
  };

  function createOmakasePlayer() {}

  function loadDataset() {
    console.log('Loading dataset', dataset.id);

    omp.loadVideo(dataset.video.url).subscribe({
      next: () => {
        console.log('Video loaded.');

        let channelsCount = 6;

        // create Omakase Player Main audio peak processor
        let peakProcessor = omp.audio.createMainAudioPeakProcessor();

        // create VU Meter by providing number of channels and VU Meter DOM container. Attach peak processor source to start peak processing
        new vuMeter.VuMeter(channelsCount, document.getElementById('main-vu')).attachSource(peakProcessor);

        omp.audio
          .createSidecarAudioTracks(
            dataset.audio.map((p, index) => ({
              src: p.url,
              label: p.label,
              active: !!p.active,
              id: `sc${index}`,
            }))
          )
          .subscribe((tracks) => {
            tracks.forEach((track) => {
              let peakProcessor = omp.audio.createSidecarAudioPeakProcessor(track.id);

              // create VU Meter
              new vuMeter.VuMeter(channelsCount, document.getElementById(`${track.id}-vu`)).attachSource(peakProcessor);
            });
          });
      },
      error: (err) => console.error('Video load error', err),
    });
  }

  function createRouter(sidecarId) {
    if (!sidecarId) {
      omp.audio.createMainAudioRouter(omp.audio.getActiveAudioTrack().channelCount ?? 2);
    } else {
      omp.audio.createSidecarAudioRouter(sidecarId).subscribe((r) => console.log(r));
    }
  }

  function activateEffect(slot, effect, sidecarIndex) {
    if (sidecarIndex === undefined) {
      omp.audio.setMainAudioEffectsGraphs(effectsMap.get(effect), {slot: slot}).subscribe(() => {
        omp.audio.removeMainAudioEffectsGraphs({slot: slot});
      });
    } else {
      omp.audio.setSidecarAudioEffectsGraph(sidecarIndex, effectsMap.get(effect), {slot: slot});

      if (sidecarIndex === 'sc1') {
        omp.audio.removeSidecarAudioEffectsGraphs(sidecarIndex, {slot: slot});
      }
    }
    console.log(`activateEffect(slot=${slot}, effect=${effect})`);
  }

  function deactivateEffect(slot, sidecarId) {
    if (sidecarId === undefined) {
      omp.audio.removeMainAudioEffectsGraphs({slot: slot});
    } else {
      omp.audio.removeSidecarAudioEffectsGraphs(sidecarId, {slot: slot});
    }
    console.log(`deactivateEffect(slot=${slot})`);
  }

  // ====== Initialization ======
  createOmakasePlayer();
  loadDataset();

  // ====== Helper to bind section buttons ======
  function setupSection(sectionId, createRouterFn) {
    const createBtn = document.querySelector(`#${sectionId} .btn-create-router`);
    const activateBtn = document.querySelector(`#${sectionId} .btn-activate`);
    const deactivateBtn = document.querySelector(`#${sectionId} .btn-deactivate`);
    const slotSelect = document.querySelector(`#${sectionId} .slot-select`);
    const effectSelect = document.querySelector(`#${sectionId} .effect-select`);

    createBtn.onclick = () => createRouter(idMap.get(sectionId));
    activateBtn.onclick = () => activateEffect(slotSelect.value, effectSelect.value, idMap.get(sectionId));
    deactivateBtn.onclick = () => deactivateEffect(slotSelect.value, idMap.get(sectionId));
  }

  setupSection('sidecar1-section');
  setupSection('sidecar2-section');
  setupSection('main-section');
  document.getElementById('btn-detach').onclick = () => omp.video.detachVideoWindow();

  window.omp = omp;
});
