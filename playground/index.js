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

import {AudioTrackLane, MarkerLane, MomentMarker, OmakasePlayer, PeriodMarker, SubtitlesLane, ThumbnailLane} from '../src';
import {RandomUtil} from '../src/util/random-util';
import {ColorUtil} from '../src/util/color-util';

window.addEventListener('load', () => {
  let eventProcessor = (eventKey, event) => {
    console.log('EVENT: ' + eventKey, event);
  };

  let addTodatasetSelect = (value, text) => {
    let datasetSelect = document.getElementById('datasetSelect');
    let option = document.createElement('option');
    option.value = value;
    option.text = text;
    datasetSelect.append(option);
  };

  let testStreams = [
    {
      id: 'omakase_player_demo1',
      name: 'Omakase Player Demo 1',
      url: 'https://demo.player.byomakase.org/data/sdr-ts/meridian_sdr.m3u8',
      fps: 25,
      thumbnails: [
        {
          id: 'thumbnails1',
          description: 'Thumbnails',
          url: 'https://demo.player.byomakase.org/data/thumbnails/timeline.vtt',
        },
      ],
      subtitles: [
        {
          id: 'da-dk-1',
          description: 'Dutch',
          language: 'da-dk',
          url: 'https://demo.player.byomakase.org/data/subtitles/meridian_sdr_DN.vtt',
        },
      ],
      audio: [
        {
          id: 'audioLvl20',
          name: 'audioLvl20',
          url: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud20t1c1-2-1-SEC-2_0.vtt',
        },
        {
          id: 'audioLvl51',
          name: 'audioLvl51',
          url: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1.vtt',
        },
      ],
    },
  ];

  testStreams.forEach((testStream) => {
    addTodatasetSelect(testStream.id, testStream.name);
  });

  let activeStreamData = testStreams.find((p) => p.id === 'omakase_player_demo1');

  let omakasePlayer = new OmakasePlayer({
    playerHTMLElementId: 'omakase-player1',
    style: {
      fontFamily: 'Arial',
    },
  });

  omakasePlayer.video.onVideoError$.subscribe((event) => {
    console.log(event);
  });

  omakasePlayer.loadVideo(activeStreamData.url, {frameRate: activeStreamData.fps}).subscribe({
    next: (video) => {
      // omakasePlayer.video.play();
      // omakasePlayer.video.mute();

      omakasePlayer.video.onVideoTimeChange$.subscribe((event) => {
        // console.log(`video.timeChangeEvent$`, event)
        document.getElementById('inputFrameSeek').value = event.frame;
        document.getElementById('inputTimestamp').value = event.currentTime;
        document.getElementById('inputTimestampFormatted').value = omakasePlayer.video.formatToTimecode(event.currentTime);

        // let hls = omakasePlayer.video.getHls();
        // console.log(hls.levels[hls.currentLevel].details)
      });

      omakasePlayer.video.onSeeked$.subscribe((event) => {
        // console.log('omakasePlayer.video.onSeeked$', event)
      });

      omakasePlayer.audio.onAudioSwitched$.subscribe((event) => {
        // console.log('omakasePlayer.video.onAudioSwitched$', event)
      });

      if (activeStreamData.subtitles && activeStreamData.subtitles.length > 0) {
        activeStreamData.subtitles.forEach((subtitle) => {
          omakasePlayer.subtitles
            .createVttTrack({
              id: subtitle.id,
              src: subtitle.url,
              label: subtitle.description,
              language: subtitle.language,
            })
            .subscribe((subtitlesVttTrack) => {
              omakasePlayer.subtitles.showTrack(subtitlesVttTrack.id);
            });
        });
      }

      createTimeline();
    },
    error: (error) => {
      console.log('Caught error: ');
      console.error(error);
    },
  });

  let createTimeline = () => {
    omakasePlayer
      .createTimeline({
        thumbnailVttUrl: activeStreamData.thumbs_vtt,
        style: {
          loadingAnimationTheme: 'dark',
        },
      })
      .subscribe((timeline) => {
        // console.log('Timeline created')

        timeline.onScroll$.subscribe((event) => {
          // eventProcessor('timeline.scrollEvent$', event);
          document.getElementById('inputScrollTo').value = event.scrollPercent;
        });

        timeline.onZoom$.subscribe((event) => {
          // eventProcessor('timeline.zoomEvent$', event);
          document.getElementById('inputZoomTo').value = event.zoomPercent;
        });

        attachButtonHandlers(timeline);
        createTimelineLanes(timeline);
      });

    let createTimelineLanes = (timeline) => {
      if (activeStreamData.thumbnails && activeStreamData.thumbnails.length > 0) {
        activeStreamData.thumbnails.forEach((thumbnails) => {
          let thumbnailLane = new ThumbnailLane({
            id: thumbnails.id,
            description: thumbnails.description,
            vttUrl: thumbnails.url,
            style: {
              backgroundFill: '#0078ef',
              height: 60,
              leftBackgroundFill: '#72e79f',
              leftBackgroundOpacity: 0.8,
            },
            loadingAnimationEnabled: true,
          });

          thumbnailLane.onClick$.subscribe((event) => {
            omakasePlayer.video.seekToTime(event.thumbnail.cue.startTime).subscribe(() => {});
          });

          timeline.addTimelineLane(thumbnailLane);
        });
      }

      if (activeStreamData.subtitles && activeStreamData.subtitles.length > 0) {
        activeStreamData.subtitles.forEach((subtitle) => {
          let subtitlesLane = new SubtitlesLane({
            id: subtitle.id,
            description: subtitle.description,
            vttUrl: subtitle.url,
            style: {
              backgroundFill: '#eaeaea',
              paddingTop: 5,
              paddingBottom: 5,
            },
          });

          timeline.addTimelineLane(subtitlesLane);
        });
      }

      if (activeStreamData.audio && activeStreamData.audio.length > 0) {
        activeStreamData.audio.forEach((audio) => {
          let audioTrackLane = new AudioTrackLane({
            id: audio.id,
            description: audio.name,
            vttUrl: audio.url,
            style: {
              backgroundFill: '#ffffff',
              paddingTop: 5,
              paddingBottom: 5,
              height: 100,
              itemWidth: 3,
              itemMinPadding: 1,
              itemCornerRadius: 2,
              maxSampleFillLinearGradientColorStops: [0, '#ff0099', 0.2, 'yellow', 1, 'green'],
              minSampleFillLinearGradientColorStops: [0, 'green', 0.8, 'yellow', 1, 'red'],
            },
          });

          timeline.addTimelineLane(audioTrackLane);
        });
      }

      let showSafeZone = true;

      if (showSafeZone) {
        let _4_3 = omakasePlayer.video.addSafeZone({
          aspectRatio: '4/3',
          scalePercent: 90,
        });

        let _16_9 = omakasePlayer.video.addSafeZone({
          aspectRatio: '16/9',
          scalePercent: 30,
        });

        let _9_16 = omakasePlayer.video.addSafeZone({
          aspectRatio: '9/16',
        });

        let _17_9 = omakasePlayer.video.addSafeZone({
          aspectRatio: '17/9',
        });
      }

      let inAndOutMarkersLane = timeline.getTimelineLane('marker_lane_inout_1');
      let inAndOutMarkersLane2 = timeline.getTimelineLane('marker_lane_inout_2');

      if (!inAndOutMarkersLane) {
        inAndOutMarkersLane = new MarkerLane({
          id: 'marker_lane_inout_1',
          description: 'In and out markers',
          style: {
            backgroundFill: '#eaeaea',
            height: 50,
          },
        });

        timeline.addTimelineLane(inAndOutMarkersLane);
      }

      if (!inAndOutMarkersLane2) {
        inAndOutMarkersLane2 = new MarkerLane({
          id: 'marker_lane_inout_2',
          description: 'In and out markers 2',
          style: {
            backgroundFill: '#d0d0d0',
          },
        });

        timeline.addTimelineLane(inAndOutMarkersLane2);
      }

      let renderTypes = ['lane', 'spanning'];
      let symbolTypes = ['square', 'triangle', 'circle'];

      let randomRenderType = () => {
        return renderTypes[RandomUtil.randomNumber(0, renderTypes.length - 1)];
      };

      let randomSymbolType = () => {
        return symbolTypes[RandomUtil.randomNumber(0, symbolTypes.length - 1)];
      };

      let randomMarkerStyle = () => {
        return {
          color: ColorUtil.randomHexColor(),
          renderType: randomRenderType(),
          symbolType: randomSymbolType(),
        };
      };

      let randomMomentTimeObservation = () => {
        return {
          time: RandomUtil.randomNumber(0, omakasePlayer.video.getDuration()),
        };
      };

      let randomPeriodTimeObservation = () => {
        let start = RandomUtil.randomNumber(0, omakasePlayer.video.getDuration());
        let duration = omakasePlayer.video.getDuration() * 0.3;
        let end = RandomUtil.randomNumber(start, start + duration > omakasePlayer.video.getDuration() ? omakasePlayer.video.getDuration() : start + duration);
        return {
          start: start,
          end: end,
        };
      };

      let createDebugMarkers = (markerLane) => {
        markerLane.createMomentMarker({
          id: 'moment_marker_lane1',
          timeObservation: {
            time: 50,
          },
          editable: true,
          style: {
            symbolType: 'square',
            color: ColorUtil.randomHexColor(),
            renderType: 'lane',
          },
        });

        markerLane.addMarker(
          new MomentMarker({
            id: 'moment_marker_spanning1',
            timeObservation: {
              time: 100,
            },
            style: {
              symbolType: 'square',
              color: ColorUtil.randomHexColor(),
              renderType: 'spanning',
            },
          })
        );

        markerLane.createPeriodMarker({
          id: 'testmarker2',
          timeObservation: {
            start: 150,
            end: 200,
          },
          style: {
            symbolType: 'square',
            color: ColorUtil.randomHexColor(),
            renderType: 'lane',
          },
        });

        markerLane.addMarker(
          new PeriodMarker({
            id: 'testmarker4',
            timeObservation: {
              start: 250,
              end: 300,
            },
            style: {
              symbolType: 'square',
              color: ColorUtil.randomHexColor(),
              renderType: 'spanning',
            },
          })
        );

        markerLane.addMarker(
          new PeriodMarker({
            id: 'testmarker5',
            timeObservation: {
              start: 1250,
              end: 1250,
            },
            style: {
              symbolType: 'square',
              color: ColorUtil.randomHexColor(),
              renderType: 'spanning',
            },
          })
        );
      };

      createDebugMarkers(inAndOutMarkersLane);
      createDebugMarkers(inAndOutMarkersLane2);
    };
  };

  let attachButtonHandlers = (timeline) => {};

  let buttonZoomTo = document.getElementById('buttonZoomTo');
  buttonZoomTo.onclick = function () {
    let percent = document.getElementById('inputZoomTo').value;
    omakasePlayer.timeline.zoomToEased(percent).subscribe((result) => {
      console.log(`Zoom to ${result}% completed`);
    });
  };

  let buttonZoom100 = document.getElementById('buttonZoom100');
  buttonZoom100.onclick = function () {
    omakasePlayer.timeline.zoomToEased(100).subscribe((result) => {
      console.log(`Zoom to ${result}% completed`);
    });
  };

  let buttonZoom1500 = document.getElementById('buttonZoom1500');
  buttonZoom1500.onclick = function () {
    omakasePlayer.timeline.zoomToEased(1500).subscribe((result) => {
      console.log(`Zoom to ${result}% completed`);
    });
  };

  let buttonScrollTo = document.getElementById('buttonScrollTo');
  buttonScrollTo.onclick = function () {
    let percent = document.getElementById('inputScrollTo').value;
    omakasePlayer.timeline.scrollToEased(percent).subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  };

  let buttonScroll0 = document.getElementById('buttonScroll0');
  buttonScroll0.onclick = function () {
    omakasePlayer.timeline.scrollToEased(0).subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  };

  let buttonScroll100 = document.getElementById('buttonScroll100');
  buttonScroll100.onclick = function () {
    omakasePlayer.timeline.scrollToEased(100).subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  };

  let buttonScrollToPlayhead = document.getElementById('buttonScrollToPlayhead');
  buttonScrollToPlayhead.onclick = function () {
    omakasePlayer.timeline.scrollToPlayheadEased().subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  };

  let buttonFrameSeek = document.getElementById('buttonFrameSeek');
  buttonFrameSeek.onclick = function () {
    let frame = document.getElementById('inputFrameSeek').value;
    omakasePlayer.video.seekToFrame(frame).subscribe(() => {});
  };

  let buttonFramePrevious = document.getElementById('buttonFramePrevious');
  buttonFramePrevious.onclick = function () {
    omakasePlayer.video.seekPreviousFrame().subscribe(() => {});
  };

  let buttonFrameNext = document.getElementById('buttonFrameNext');
  buttonFrameNext.onclick = function () {
    omakasePlayer.video.seekNextFrame().subscribe(() => {});
  };

  let buttonFrameAdd = document.getElementById('buttonFrameAdd');
  buttonFrameAdd.onclick = function () {
    let frames = document.getElementById('inputFrameAdd').value;
    omakasePlayer.video.seekFromCurrentFrame(frames).subscribe(() => {});
  };

  let buttonPlay = document.getElementById('buttonPlay');
  buttonPlay.onclick = function () {
    omakasePlayer.video.play();
  };

  let buttonPause = document.getElementById('buttonPause');
  buttonPause.onclick = function () {
    omakasePlayer.video.pause();
  };

  let buttonFullscreen = document.getElementById('buttonFullscreen');
  buttonFullscreen.onclick = function () {
    omakasePlayer.video.toggleFullscreen();
  };

  let buttonTimestampSeek = document.getElementById('buttonTimestampSeek');
  buttonTimestampSeek.onclick = function () {
    let timestamp = document.getElementById('inputTimestamp').value;
    omakasePlayer.video.seekToTime(timestamp).subscribe(() => {});
  };

  let datasetSelect = document.getElementById('datasetSelect');
  datasetSelect.onchange = (event) => {
    let id = datasetSelect.value;

    let testStream = testStreams.find((p) => p.id === id);

    let videoUrl = testStream.url;
    let videoFps = testStream.fps;

    omakasePlayer.loadVideo(videoUrl, {frameRate: videoFps}).subscribe((event) => {
      console.log('Another video loaded?');
    });
  };

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

  omakasePlayer.video.appendHelpMenuGroup({
    name: 'Keyboard shortcuts',
    items: [
      {
        name: 'Video toggle play / pause',
        description: 'Space',
      },
      {
        name: 'Video seek previous frame',
        description: 'Left arrow',
      },
      {
        name: 'Video seek next frame',
        description: 'Right arrow',
      },
    ],
  });

  setTimeout(() => {

    omakasePlayer.video.loadBlackVideo()

  }, 3000)

  window.omakasePlayer = omakasePlayer; // for console debugging
});
