import {AudioTrackLane, MarkerLane, MomentMarker, OmakasePlayer, PeriodMarker, SubtitlesLane, ThumbnailLane} from "../src";
import {RandomUtil} from "../src/util/random-util";
import {ColorUtil} from "../src/util/color-util";
import Hls from "hls.js";

window.addEventListener('load', () => {
  let eventProcessor = (eventKey, event) => {
    console.log('EVENT: ' + eventKey, event)
  }

  let addToStreamsSelect = (value, text) => {
    let streamsSelect = document.getElementById('streamsSelect');
    let option = document.createElement('option');
    option.value = value;
    option.text = text;
    streamsSelect.append(option)
  }

  let testStreams = [
    {
      id: 'omakase_player_demo1',
      name: 'Omakase Player Demo 1',
      url: "https://demo.player.byomakase.org/data/hls/CPL_MER_SHR_C_EN-XX_US-NR_51_LTRT_UHD_20160913_OV_a8f500d1-ba98-4598-815b-54fa640661d6_SDR_TC_NOSLOW_PAL.m3u8",
      fps: 25,
      thumbnails: [
        {
          'id': 'thumbnails1',
          'description': 'Thumbnails',
          'url': 'https://demo.player.byomakase.org/data/thumbnails/timeline.vtt'
        }
      ],
      subtitles: [
        {
          'id': 'da-dk-1',
          'description': 'Dutch',
          'language': 'da-dk',
          'url': 'https://demo.player.byomakase.org/data/subtitles/meridian_da_subs_11m58s.vtt'
        }
      ],
      audio: [
        {
          'id': 'audioLvl20',
          'name': 'audioLvl20',
          'url': 'https://demo.player.byomakase.org/data/audio-levels/MER_SHR_C_EN-XX_US-NR_51_LTRT_UHD_20160913_OV_01_EN_20_B.vtt'
        },
        {
          'id': 'audioLvl51',
          'name': 'audioLvl51',
          'url': 'https://demo.player.byomakase.org/data/audio-levels/MER_SHR_C_EN-XX_US-NR_51_LTRT_UHD_20160913_OV_01_EN_51_A.vtt'
        }
      ]
    }
  ];

  testStreams.forEach(testStream => {
    addToStreamsSelect(testStream.id, testStream.name)
  })

  let activeStreamData = testStreams.find(p => p.id === 'omakase_player_demo1')

  let omakasePlayer = new OmakasePlayer({
    playerHTMLElementId: 'omakase-player1',
    style: {
      fontFamily: 'Arial'
    }
  });

  let hlsInstance = omakasePlayer.video.getHls();
  hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
    console.log('Hls event MANIFEST_PARSED', data);
  })

  omakasePlayer.video.onVideoError$.subscribe(event => {
    console.log(event)
  })

  omakasePlayer.loadVideo(activeStreamData.url, activeStreamData.fps).subscribe({
    next: (video) => {

      // omakasePlayer.video.play();
      // omakasePlayer.video.mute();

      omakasePlayer.video.onVideoTimeChange$.subscribe((event) => {
        // console.log(`video.timeChangeEvent$`, event)
        document.getElementById('inputFrameSeek').value = event.frame;
        document.getElementById('inputTimestamp').value = event.currentTime;
        document.getElementById('inputTimestampFormatted').value = omakasePlayer.video.formatTimestamp(event.currentTime);

        // let hls = omakasePlayer.video.getHls();
        // console.log(hls.levels[hls.currentLevel].details)
      })

      omakasePlayer.video.onSeeked$.subscribe(event => {
        // console.log('omakasePlayer.video.onSeeked$', event)
      })

      omakasePlayer.video.onAudioSwitched$.subscribe(event => {
        // console.log('omakasePlayer.video.onAudioSwitched$', event)
      })

      if (activeStreamData.subtitles && activeStreamData.subtitles.length > 0) {
        activeStreamData.subtitles.forEach(subtitle => {
          omakasePlayer.subtitles.createVttTrack({
            id: subtitle.id, src: subtitle.url, label: subtitle.description, language: subtitle.language
          }).subscribe(subtitlesVttTrack => {
            omakasePlayer.subtitles.showTrack(subtitlesVttTrack.id)
          })
        })
      }

      omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_SUBTITLES_CREATE, (event) => {
        console.log('Subtitles loaded', event)
      })

      let audioTracks = omakasePlayer.audio.getAudioTracks()
      // console.log('Audio tracks', omakasePlayer.video.getAudioTracks())
      if (audioTracks && audioTracks.length > 0) {
        omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_AUDIO_SWITCHED, (event) => {
          // console.log('Audio track switched', event);
        })

        let currentAudioTrack = omakasePlayer.audio.getCurrentAudioTrack();
        let differentAudioTrackIndex = audioTracks.findIndex(p => p !== currentAudioTrack);

        setTimeout(() => {
          omakasePlayer.audio.setAudioTrack(differentAudioTrackIndex);
        }, 5000)

      }

    },
    error: (error) => {
      console.log('Caught error: ');
      console.error(error);
    }
  });

  omakasePlayer.createTimeline({
    thumbnailVttUrl: activeStreamData.thumbs_vtt
  }).subscribe((timeline) => {
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
  })


  let createTimelineLanes = (timeline) => {
    if (activeStreamData.thumbnails && activeStreamData.thumbnails.length > 0) {
      activeStreamData.thumbnails.forEach(thumbnails => {
        let thumbnailLane = new ThumbnailLane({
          id: thumbnails.id,
          description: thumbnails.description,
          thumbnailVttUrl: thumbnails.url,
          style: {
            backgroundFill: '#0078ef',
            height: 60,
            leftBackgroundFill: '#72e79f',
            leftBackgroundOpacity: 0.8
          }
        });

        thumbnailLane.onClick$.subscribe((event) => {
          omakasePlayer.video.seekToTimestamp(event.thumbnail.getThumbnailVttCue().startTime).subscribe(() => {
          })
        })

        timeline.addLane(thumbnailLane);
      })
    }

    if (activeStreamData.subtitles && activeStreamData.subtitles.length > 0) {
      activeStreamData.subtitles.forEach(subtitle => {

        let subtitlesLane = new SubtitlesLane({
          id: subtitle.id,
          description: subtitle.description,
          subtitlesVttUrl: subtitle.url,
          style: {
            backgroundFill: "#eaeaea",
            paddingTop: 5,
            paddingBottom: 5
          }
        });

        timeline.addLane(subtitlesLane);
      })
    }

    if (activeStreamData.audio && activeStreamData.audio.length > 0) {
      activeStreamData.audio.forEach(audio => {

        let audioTrackLane = new AudioTrackLane({
          id: audio.id,
          description: audio.name,
          audioVttFileUrl: audio.url,
          style: {
            backgroundFill: "#ffffff",
            paddingTop: 5,
            paddingBottom: 5,
            height: 100,
            itemWidth: 3,
            itemMinPadding: 1,
            itemCornerRadius: 2,
            maxSampleFillLinearGradientColorStops: [0, '#ff0099', 0.2, 'yellow', 1, 'green'],
            minSampleFillLinearGradientColorStops: [0, 'green', 0.8, 'yellow', 1, 'red'],
          }
        });

        timeline.addLane(audioTrackLane);
      })
    }

    let showSafeZone = true;

    if (showSafeZone) {
      let _4_3 = omakasePlayer.video.addSafeZoneWithAspectRatio({
        aspectRatioText: "4/3",
        scalePercent: 90
      });

      let _16_9 = omakasePlayer.video.addSafeZoneWithAspectRatio({
        aspectRatioText: "16/9",
        scalePercent: 30
      });

      let _9_16 = omakasePlayer.video.addSafeZoneWithAspectRatio({
        aspectRatioText: "9/16"
      });

      let _17_9 = omakasePlayer.video.addSafeZoneWithAspectRatio({
        aspectRatioText: "17/9"
      });
    }


    let inAndOutMarkersLane = timeline.getLane('marker_lane_inout_1');
    let inAndOutMarkersLane2 = timeline.getLane('marker_lane_inout_2');

    if (!inAndOutMarkersLane) {
      inAndOutMarkersLane = new MarkerLane({
        id: "marker_lane_inout_1",
        description: "In and out markers",
        style: {
          backgroundFill: '#eaeaea', height: 50
        }
      });

      timeline.addLane(inAndOutMarkersLane);
    }

    if (!inAndOutMarkersLane2) {
      inAndOutMarkersLane2 = new MarkerLane({
        id: "marker_lane_inout_2",
        description: "In and out markers 2",
        style: {
          backgroundFill: '#d0d0d0'
        }
      });

      timeline.addLane(inAndOutMarkersLane2);
    }


    let renderTypes = ['lane', 'spanning']
    let symbolTypes = ['square', 'triangle', 'circle']

    let randomRenderType = () => {
      return renderTypes[RandomUtil.randomNumber(0, renderTypes.length - 1)];
    }

    let randomSymbolType = () => {
      return symbolTypes[RandomUtil.randomNumber(0, symbolTypes.length - 1)];
    }

    let randomMarkerStyle = () => {
      return {
        color: ColorUtil.randomHexColor(),
        renderType: randomRenderType(),
        symbolType: randomSymbolType()
      }
    }

    let randomMomentTimeObservation = () => {
      return {
        time: RandomUtil.randomNumber(0, omakasePlayer.video.getDuration())
      }
    }

    let randomPeriodTimeObservation = () => {
      let start = RandomUtil.randomNumber(0, omakasePlayer.video.getDuration());
      let duration = omakasePlayer.video.getDuration() * 0.3
      let end = RandomUtil.randomNumber(start, (start + duration) > omakasePlayer.video.getDuration() ? omakasePlayer.video.getDuration() : start + duration);
      return {
        start: start, end: end
      }
    }

    let createDebugMarkers = (markerLane) => {
      markerLane.createMomentMarker({
        id: "moment_marker_lane1",
        observation: {
          time: 50
        },
        editable: false,
        style: {
          symbolType: 'square',
          color: ColorUtil.randomHexColor(),
          renderType: 'lane'
        }
      });

      markerLane.addMarker(new MomentMarker({
        id: "moment_marker_spanning1",
        observation: {
          time: 100
        },
        style: {
          symbolType: 'square',
          color: ColorUtil.randomHexColor(),
          renderType: 'spanning'
        }
      }))

      markerLane.createPeriodMarker({
        id: "testmarker2",
        observation: {
          start: 150,
          end: 200
        },
        style: {
          symbolType: 'square',
          color: ColorUtil.randomHexColor(),
          renderType: 'lane'
        }
      })

      markerLane.addMarker(new PeriodMarker({
        id: "testmarker4",
        observation: {
          start: 250,
          end: 300
        },
        style: {
          symbolType: 'square',
          color: ColorUtil.randomHexColor(),
          renderType: 'spanning'
        }
      }))


      markerLane.addMarker(new PeriodMarker({
        id: "testmarker5",
        observation: {
          start: 1250,
          end: 1250
        },
        style: {
          symbolType: 'square',
          color: ColorUtil.randomHexColor(),
          renderType: 'spanning'
        }
      }))
    }

    createDebugMarkers(inAndOutMarkersLane)
    createDebugMarkers(inAndOutMarkersLane2)
  }

  let attachButtonHandlers = (timeline) => {

  }


  let buttonZoomTo = document.getElementById('buttonZoomTo');
  buttonZoomTo.onclick = function () {
    let percent = document.getElementById('inputZoomTo').value;
    omakasePlayer.timeline.zoomTo(percent).subscribe((result) => {
      console.log(`Zoom to ${result}% completed`);
    });
  }

  let buttonZoom100 = document.getElementById('buttonZoom100');
  buttonZoom100.onclick = function () {
    omakasePlayer.timeline.zoomTo(100).subscribe(result => {
      console.log(`Zoom to ${result}% completed`);
    });
  }

  let buttonZoom1500 = document.getElementById('buttonZoom1500');
  buttonZoom1500.onclick = function () {
    omakasePlayer.timeline.zoomTo(1500).subscribe(result => {
      console.log(`Zoom to ${result}% completed`);
    });
  }

  let buttonScrollTo = document.getElementById('buttonScrollTo');
  buttonScrollTo.onclick = function () {
    let percent = document.getElementById('inputScrollTo').value;
    omakasePlayer.timeline.scrollTo(percent).subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  }

  let buttonScroll0 = document.getElementById('buttonScroll0');
  buttonScroll0.onclick = function () {
    omakasePlayer.timeline.scrollTo(0).subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  }

  let buttonScroll100 = document.getElementById('buttonScroll100');
  buttonScroll100.onclick = function () {
    omakasePlayer.timeline.scrollTo(100).subscribe((result) => {
      console.log(`Scroll to ${result}% completed`);
    });
  }

  let buttonScrollToPlayhead = document.getElementById('buttonScrollToPlayhead');
  buttonScrollToPlayhead.onclick = function () {
    omakasePlayer.timeline.scrollToPlayhead().subscribe(result => {
      console.log(`Scroll to ${result}% completed`);
    });
  }


  let buttonFrameSeek = document.getElementById('buttonFrameSeek');
  buttonFrameSeek.onclick = function () {
    let frame = document.getElementById('inputFrameSeek').value;
    omakasePlayer.video.seekToFrame(frame).subscribe(() => {
    });
  }

  let buttonFramePrevious = document.getElementById('buttonFramePrevious');
  buttonFramePrevious.onclick = function () {
    omakasePlayer.video.seekPreviousFrame().subscribe(() => {
    });
  }

  let buttonFrameNext = document.getElementById('buttonFrameNext');
  buttonFrameNext.onclick = function () {
    omakasePlayer.video.seekNextFrame().subscribe(() => {
    });
  }

  let buttonFrameAdd = document.getElementById('buttonFrameAdd');
  buttonFrameAdd.onclick = function () {
    let frames = document.getElementById('inputFrameAdd').value;
    omakasePlayer.video.seekFromCurrentFrame(frames).subscribe(() => {
    });
  }

  let buttonPlay = document.getElementById('buttonPlay');
  buttonPlay.onclick = function () {
    omakasePlayer.video.play();
  }

  let buttonPause = document.getElementById('buttonPause');
  buttonPause.onclick = function () {
    omakasePlayer.video.pause();
  }

  let buttonFullscreen = document.getElementById('buttonFullscreen');
  buttonFullscreen.onclick = function () {
    omakasePlayer.video.toggleFullscreen();
  }

  let buttonTimestampSeek = document.getElementById('buttonTimestampSeek');
  buttonTimestampSeek.onclick = function () {
    let timestamp = document.getElementById('inputTimestamp').value;
    omakasePlayer.video.seekToTimestamp(timestamp).subscribe(() => {
    });
  }

  let streamsSelect = document.getElementById('streamsSelect');
  streamsSelect.onchange = (event) => {
    let id = streamsSelect.value;

    let testStream = testStreams.find(p => p.id === id);

    let videoUrl = testStream.url;
    let videoFps = testStream.fps;

    omakasePlayer.loadVideo(videoUrl, videoFps).subscribe((event) => {
      console.log('Another video loaded?')
    })
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      if (event.target === document.body) {
        event.preventDefault(); // prevents scrolling
        omakasePlayer.video.togglePlayPause();
      }
    }

    if (event.code === 'ArrowLeft') {
      if (event.target === document.body) {
        event.preventDefault();
        omakasePlayer.video.seekPreviousFrame().subscribe(() => {
        })
      }
    }

    if (event.code === 'ArrowRight') {
      if (event.target === document.body) {
        event.preventDefault();
        omakasePlayer.video.seekNextFrame().subscribe(() => {
        })
      }
    }
  })

  omakasePlayer.video.addHelpMenuGroup({
    name: 'Keyboard shortcuts',
    items: [
      {
        name: 'Video toggle play / pause',
        description: 'Space'
      },
      {
        name: 'Video seek previous frame',
        description: 'Left arrow'
      },
      {
        name: 'Video seek next frame',
        description: 'Right arrow'
      }
    ]
  })


  window.omakasePlayer = omakasePlayer; // for console debugging
})


