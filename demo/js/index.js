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

let activeMarker = null;
let activeMarkerIndex = -1;
let currentSpeed = 1;
let currentAudio = '5.1';
let currentCaption = 'EN';
let speeds = [0.25, 0.5, 0.75, 1, 2, 4, 8];
let captions = ['EN', 'DK'];
let audios = ['5.1', '2.0'];
let audioContext = null;
let markerCount = 2;
let maxMarkerCount = 7;
let splitLaneId = 0;
let urlSelector = 0;
let markerColors = ['#E4ABFF', '#6AC7F6', '#A007E8', '#FCD004', '#009CEB', '#5E1879', '#4D79A7', '#A481B5', '#5A6C80', '#2B299E', '#EE9247', '#520160', '#863800', '#CD5600'];
let omakasePlayer;
let activeAlertType = null;
let commentAlertId = null;
let commentSubscription = null;
let measurementSubscription = null;
let mouseOnLegendButton = false;
let omakaseMarkerList = null;
let routerVisualization = null;
let browserIsSafari = false;
let thumbnailVttFile;

let urls = [
  {
    name: 'Video 1',
    frameRate: 30,
    video: 'https://demo.player.byomakase.org/data/sdr-ts/meridian_sdr.m3u8',
    thumbnails: 'https://demo.player.byomakase.org/data/thumbnails/timeline.vtt',
    bitrate: 'https://demo.player.byomakase.org/data/analysis/bitrate_2-SEC.vtt',
    multipleMeasurements: 'https://demo.player.byomakase.org/data/analysis/R128X_20_2-SEC.vtt',
    blacks: 'https://demo.player.byomakase.org/data/events/black-segments.vtt',
    poi: 'https://demo.player.byomakase.org/data/events/points-of-interest.vtt',
    ebur128: 'https://demo.player.byomakase.org/data/analysis/ebur128_M_2-SEC.vtt',
    rms: 'https://demo.player.byomakase.org/data/analysis/overall_RMS_level_2-SEC.vtt',
    enCaption: 'https://demo.player.byomakase.org/data/subtitles/meridian_en_cc_11m58s.vtt',
    dkSubtitle: 'https://demo.player.byomakase.org/data/subtitles/meridian_sdr_DN.vtt',
    audioLvl20: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud20t1c1-2-1-SEC-2_0.vtt',
    audioLvl20L: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud20t1c1-2-1-SEC-2_0-L.vtt',
    audioLvl20R: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud20t1c1-2-1-SEC-2_0-R.vtt',
    audioLvl51: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1.vtt',
    audioLvl51L: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-L.vtt',
    audioLvl51R: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-R.vtt',
    audioLvl51C: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-C.vtt',
    audioLvl51LFE: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-LFE.vtt',
    audioLvl51SR: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-RS.vtt',
    audioLvl51SL: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-LS.vtt',
  },
];

detectBrowser();

window.addEventListener('load', () => {
  if (browserIsSafari) {
    domHelper.setStyle(domHelper.getById('tab-rvc'), { display: 'none' });
    domHelper.setStyle(domHelper.getById('tab-separator'), { display: 'none' });
  }

  createOmakasePlayer();
  loadOmakaseVideo(urls[urlSelector].video, urls[urlSelector].frameRate);
  omakasePlayer.video.onVideoLoaded$.subscribe((event) => {
    if (event) {
      createOmakaseTimeline();
    }
  });
  omakasePlayer.audio.onAudioLoaded$.subscribe((event) => {
    let userAgent = (window.navigator && window.navigator.userAgent) || '';

    let isFirefox = /Firefox/i.test(userAgent);
    let isEdge = /Edg/i.test(userAgent);
    let isChromium = /Chrome/i.test(userAgent) || /CriOS/i.test(userAgent);
    let isChrome = !isEdge && isChromium;

    if (event && (isFirefox || isChrome)) {
      const mainTrack = {
        name: `5.1`,
        inputNumber: 6,
        maxInputNumber: 6,
        inputLabels: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'],
      };

      router = omakasePlayer.initializeRouterVisualization({
        size: 'medium',
        routerVisualizationHTMLElementId: 'omakase-audio-router',
        mainTrack: mainTrack,
      });

      const omakaseAudioRouter = domHelper.getById('omakase-audio-router');
      const buttonGroup = domHelper.create('div');
      domHelper.setProperty(buttonGroup, 'className', 'router-size');

      let sizes = ['SMALL', 'MEDIUM', 'LARGE'];
      for (let i = 0; i < 3; i++) {
        const sizeButton = domHelper.create('button');
        const lineBreak = domHelper.create('br');

        if (i === 1) {
          domHelper.setProperty(sizeButton, 'className', 'size activated');
        } else {
          domHelper.setProperty(sizeButton, 'className', 'size');
        }
        domHelper.setProperty(sizeButton, 'innerHTML', sizes[i]);

        sizeButton.onclick = (event) => {
          router.updateSize(event.target.innerHTML.toLowerCase());
          let elems = domHelper.getByClassName('size');
          for (let j = 0; j < elems.length; j++) {
            if (elems[j].innerHTML === event.target.innerHTML) {
              domHelper.setProperty(elems[j], 'className', 'size activated');
            } else {
              domHelper.setProperty(elems[j], 'className', 'size');
            }
          }
        };
        domHelper.appendChildren(buttonGroup, [sizeButton, lineBreak]);
      }

      domHelper.appendChildren(omakaseAudioRouter, [buttonGroup]);

      createMLCAndRVCSwitcher();
    }
  });

  if (urls.length > 1) {
    createDropdownMenu();
  }

  window.addEventListener('keydown', keyListener);
  window.addEventListener('keydown', initializeVuMeter);
  window.addEventListener('mousedown', initializeVuMeter);
  domHelper.getById('addMarker').onclick = addMarker;

  initializePlayerEventListeners();

  window.omakasePlayer = omakasePlayer;
});

function createOmakasePlayer() {
  omakasePlayer = new omakase.OmakasePlayer({
    playerHTMLElementId: 'omakase-player',
    mediaChrome: 'disabled',
    style: {
      fontFamily: 'Arial',
    },
  });
}

function loadOmakaseVideo(url, frameRate = 30) {
  // Load video
  if (!url) {
    omakasePlayer.destroy();

    throw new Error('Video url is required!');
  } else {
    omakasePlayer.loadVideo(url, frameRate).subscribe();
  }
}

function createOmakaseTimeline() {
  omakasePlayer
    .createTimeline({
      thumbnailVttUrl: urls[urlSelector].thumbnails,
      style: {
        stageMinWidth: 700,
        backgroundFill: '#E9F7FF',
        headerBackgroundFill: '#E4E5E5',
        footerBackgroundFill: '#E4E5E5',

        playProgressBarHeight: 12,
        scrollbarHeight: 0,
        footerHeight: 10,
        footerMarginTop: 0,

        thumbnailHoverWidth: 200,
        thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
        thumbnailHoverStrokeWidth: 5,
        thumbnailHoverYOffset: 0,

        headerHeight: 20,
        headerMarginBottom: 0,
        leftPaneWidth: 200,
        rightPanelLeftGutterWidth: 30,
        rightPanelRightGutterWidth: 30,
        timecodedContainerClipPadding: 20,

        playheadVisible: true,
        playheadFill: '#000',
        playheadLineWidth: 2,
        playheadSymbolHeight: 10,
        playheadScrubberHeight: 10,

        playheadBackgroundFill: '#ffffff',
        playheadBackgroundOpacity: 1,

        playheadPlayProgressFill: '#008cbc',
        playheadPlayProgressOpacity: 0.5,

        playheadBufferedFill: '#a2a2a2',
        playheadBufferedOpacity: 1,

        stageMinHeight: 300,
        playheadHoverTextYOffset: -25,
        playheadHoverTextFill: '#000000',
        playheadTextFill: 'rgba(255, 255, 255, 0)',

        scrubberTextFill: '#000000',
        scrubberTextYOffset: -15,
      },
    })
    .subscribe(() => initializeOmakaseTimeline());
}

function initializeOmakaseTimeline() {
  omakasePlayer.timeline.onReady$.subscribe(() => {
    omakasePlayer.timeline.getScrubberLane().style = {
      backgroundFill: '#EDEFEE',
      leftBackgroundFill: '#E4E5E5',
      descriptionTextFontSize: 20,
      marginBottom: 0,
    };

    omakasePlayer.timeline.getScrubberLane().updateLayoutDimensions();

    omakasePlayer.timeline.addTimelineLane(
      new omakase.LabelLane({
        style: {
          height: 15,
          backgroundFill: '#E4E5E5',
          marginBottom: 1,
        },
      })
    );

    addZoomButtons();

    //Creating Marker Lane
    let inAndOutMarkersLane = new omakase.MarkerLane({
      id: 'in_and_out_markers_lane',
      description: 'Custom markers',
      style: {
        backgroundFill: '#E9F7FF',
        height: 30,
        leftBackgroundFill: '#E4E5E5',
        marginBottom: 1,
      },
    });

    omakasePlayer.timeline.addTimelineLane(inAndOutMarkersLane);

    inAndOutMarkersLane.onMarkerFocus$.subscribe((event) => {
      console.debug('event id' + event.marker.id);
      if (omakaseMarkerList.getSelectedMarker()?.id !== event.marker.id) {
        omakaseMarkerList.toggleMarker(event.marker.id);
        activeMarker = omakaseMarkerList.getSelectedMarker();
      }
    });

    //Blacks Marker Lane
    if (urls[urlSelector].blacks) {
      let blacksMarkersLane = new omakase.MarkerLane({
        description: 'Black segments',
        vttUrl: urls[urlSelector].blacks,
        style: {
          backgroundFill: '#E9F7FF',
          height: 30,
          leftBackgroundFill: '#E4E5E5',
          marginBottom: 1,
        },
        markerCreateFn: (cue, index) => {
          return new omakase.PeriodMarker({
            timeObservation: {
              start: cue.startTime,
              end: cue.endTime,
            },
            text: `${cue.text}`,
            editable: false,
            style: {
              renderType: 'lane',
              color: '#000000',
              symbolType: 'none',
              selectedAreaOpacity: 0,
              lineOpacity: 0,
            },
          });
        },
        markerProcessFn: (marker, index) => {
          marker.onClick$.subscribe({
            next: (event) => {
              console.log(`Clicked on marker with text: `, marker.text);
              omakasePlayer.video.seekToTime(marker.timeObservation.start);
            },
          });
        },
      });

      omakasePlayer.timeline.addTimelineLane(blacksMarkersLane);
    }

    const imageConfigActive = {
      src: `https://demo.player.byomakase.org/images/info-active.svg`,
      width: 20,
      height: 20,
      listening: true,
    };
    const imageConfigInactive = {
      src: `https://demo.player.byomakase.org/images/info-inactive.svg`,
      width: 20,
      height: 20,
      listening: true,
    };

    const legendInactive = {
      src: `https://demo.player.byomakase.org/images/legend-inactive.svg`,
      width: 15,
      height: 15,
      listening: true,
    };

    const legendActive = {
      src: `https://demo.player.byomakase.org/images/legend-active.svg`,
      width: 15,
      height: 15,
      listening: true,
    };

    const commentButton = new omakase.ImageButton(imageConfigInactive);
    const measurementButton = new omakase.ImageButton(imageConfigInactive);
    const legendButton_20 = new omakase.ImageButton(legendInactive);

    legendButton_20.onMouseEnter$.subscribe(() => {
      mouseOnLegendButton = true;
    });

    legendButton_20.onMouseLeave$.subscribe(() => {
      mouseOnLegendButton = false;
    });

    document.body.addEventListener('click', (event) => {
      let legendBox = domHelper.querySelector('.legend-box');
      if (legendBox && !mouseOnLegendButton && !event.target.closest('.legend-box')) {
        domHelper.toggleLegendBox(legendButton_20, false, legendInactive, legendBox);
      }
    });

    //POI Marker lane
    if (urls[urlSelector].poi) {
      let poiLane = new omakase.MarkerLane({
        description: 'Points of interest',
        vttUrl: urls[urlSelector].poi,
        style: {
          backgroundFill: '#E9F7FF',
          height: 30,
          leftBackgroundFill: '#E4E5E5',
          marginBottom: 1,
        },
        markerCreateFn: (cue, index) => {
          return new omakase.MomentMarker({
            timeObservation: {
              time: cue.startTime,
            },
            text: `${cue.text}`,
            editable: false,
            style: {
              renderType: 'lane',
              color: '#CD5600',
              symbolType: 'circle',
            },
          });
        },
        markerProcessFn: (marker, index) => {
          marker.onClick$.subscribe({
            next: (event) => {
              console.log(`Clicked on marker with text: `, marker.text);
              omakasePlayer.video.seekToTime(marker.timeObservation.time);
            },
          });
        },
      });

      commentButton.onClick$.subscribe({
        next: () => {
          if (activeAlertType === 'vttComments') {
            activeAlertType = null;
            if (commentAlertId) {
              omakasePlayer.alerts.dismiss(commentAlertId);
            }
            if (commentSubscription) {
              commentSubscription.unsubscribe();
              commentSubscription = null;
            }
            commentAlertId = null;
            commentButton.setImage(imageConfigInactive);
          } else {
            if (activeAlertType === 'vttMeasurements') {
              measurementButton.setImage(imageConfigInactive);
              if (measurementSubscription) {
                measurementSubscription.unsubscribe();
                measurementSubscription = null;
              }
            }
            activeAlertType = 'vttComments';
            commentButton.setImage(imageConfigActive);
            commentSubscription = subscribeToComments(poiLane);
          }
        },
      });

      poiLane.addTimelineNode({
        width: 30,
        height: 30,
        justify: 'start',
        margin: [10, 10, 0, 0],
        timelineNode: commentButton,
      });

      omakasePlayer.timeline.addTimelineLane(poiLane);
    }

    //Adding Thumbnail Lane to timeline
    if (urls[urlSelector].thumbnails) {
      let defaultThumbnailLane = new omakase.ThumbnailLane({
        id: 'thumbnail_lane_default',
        description: 'Thumbnails',
        vttUrl: urls[urlSelector].thumbnails,
        style: {
          backgroundFill: '#E9F7FF',
          height: 50,
          leftBackgroundFill: '#E4E5E5',
          thumbnailHoverScale: 2,
          marginBottom: 1,
        },
      });

      //automatic position to thumb start frame
      defaultThumbnailLane.onClick$.subscribe((event) => {
        omakasePlayer.video.seekToTime(event.thumbnail.cue.startTime);
      });

      // Add thumbnails to the marker list
      defaultThumbnailLane.onVttFileLoaded$.subscribe((vttFile) => {
        if (omakaseMarkerList) {
          omakaseMarkerList.thumbnailVttFile = vttFile;
        } else {
          thumbnailVttFile = vttFile;
        }
      });

      omakasePlayer.timeline.addTimelineLane(defaultThumbnailLane);

      const marker = inAndOutMarkersLane.createPeriodMarker({
        id: 'predefined_marker',
        text: 'Predefined marker',
        timeObservation: {
          start: 10.001,
          end: 33,
        },
        style: {
          symbolType: 'triangle',
          color: markerColors[1],
          renderType: 'lane',
        },
        editable: false,
      });

      // Creating a Marker List
      omakasePlayer
        .createMarkerList({
          headerHTMLElementId: 'marker-header',
          templateHTMLElementId: 'marker-template',
          emptyHTMLElementId: 'marker-empty',
          source: [inAndOutMarkersLane],
          styleUrl: './css/player.css',
          timeEditable: true
        })
        .subscribe((markerList) => {
          omakaseMarkerList = markerList;
          if (thumbnailVttFile) {
            markerList.thumbnailVttFile = thumbnailVttFile;
          }
          markerList.toggleMarker(marker.id);
          activeMarker = marker;
          markerList.onMarkerClick$.subscribe(({ marker }) => {
            if (marker.id !== markerList.getSelectedMarker()?.id) {
              markerList.toggleMarker(marker.id);
              activeMarker = markerList.getSelectedMarker();
            }
          });
          markerList.onMarkerSelected$.subscribe(({ marker }) => {
            if (marker) {
              activeMarkerIndex = markerList.getMarkers().findIndex((m) => m.id === marker.id);
            }
          });
          markerList.onMarkerDelete$.subscribe(() => {
            updateAddMarkerButton();
            if (!markerList.getSelectedMarker()) {
              const nextMarker = markerList.getMarkers()[activeMarkerIndex] ?? markerList.getMarkers()[activeMarkerIndex - 1] ?? markerList.getMarkers()[0];
              if (nextMarker) {
                markerList.toggleMarker(nextMarker.id);
              }
            }
          });
        });
    }

    if (inAndOutMarkersLane.getMarkers().length === 0) {
      inAndOutMarkersLane.minimize();
    } else {
      inAndOutMarkersLane.maximize();
    }

    if (urls[urlSelector].bitrate) {
      let lineChartLaneForBitrate = new omakase.LineChartLane({
        vttUrl: urls[urlSelector].bitrate,
        description: 'Video Bitrate (0-7500)',
        yMax: 7500,
        yMin: 0,
        style: {
          pointWidth: 3,
          lineStrokeWidth: 2,
          fill: '#000000',
          pointFill: '#00000022',
          backgroundFill: '#E9F7FF',
          height: 50,
          leftBackgroundFill: '#E4E5E5',
          marginBottom: 1,
        },
      });

      measurementButton.onClick$.subscribe({
        next: () => {
          if (activeAlertType === 'vttMeasurements') {
            activeAlertType = null;
            measurementButton.setImage(imageConfigInactive);
            if (measurementSubscription) {
              measurementSubscription.unsubscribe();
              measurementSubscription = null;
            }
          } else {
            if (activeAlertType === 'vttComments') {
              commentButton.setImage(imageConfigInactive);
              if (commentAlertId) {
                omakasePlayer.alerts.dismiss(commentAlertId);
                commentAlertId = null;
              }
              if (commentSubscription) {
                commentSubscription.unsubscribe();
                commentSubscription = null;
              }
            }
            activeAlertType = 'vttMeasurements';
            measurementButton.setImage(imageConfigActive);
            measurementSubscription = subscribeToMeasurements(lineChartLaneForBitrate);
          }
        },
      });

      lineChartLaneForBitrate.addTimelineNode({
        width: 30,
        height: 30,
        justify: 'start',
        margin: [10, 10, 0, 0],
        timelineNode: measurementButton,
      });

      omakasePlayer.timeline.addTimelineLane(lineChartLaneForBitrate);
    }

    let subtitlesLane2;
    if (urls[urlSelector].dkSubtitle) {
      subtitlesLane2 = new omakase.SubtitlesLane({
        description: '',
        vttUrl: urls[urlSelector].dkSubtitle,
        style: {
          backgroundFill: '#E9F7FF',
          height: 40,
          leftBackgroundFill: '#E4E5E5',
          subtitlesLaneItemOpacity: 0.7,
          subtitlesLaneItemFill: '#87D798',
          paddingTop: 10,
          paddingBottom: 10,
          marginBottom: 1,
        },
      });

      omakasePlayer.timeline.addTimelineLane(subtitlesLane2);
    }

    let subDkLabel = new omakase.TextLabel({
      text: `DK`,
      listening: true,
      style: {
        align: 'center',
        verticalAlign: 'middle',
        fill: '#ffffff',
        backgroundFill: '#f45844',
        backgroundBorderRadius: 3,
      },
    });

    omakasePlayer.subtitles.onShow$.subscribe((event) => {
      if ('da-dk' !== omakasePlayer.subtitles.getActiveTrack().language) {
        subDkLabel.style = {
          backgroundFill: '#f45844',
        };
      } else {
        subDkLabel.style = {
          backgroundFill: '#008000',
        };
      }
    });

    subDkLabel.onClick$.subscribe({
      next: (event) => {
        currentCaption = 'DK';
        omakasePlayer.subtitles.showTrack(omakasePlayer.subtitles.getTracks()[1].id);
        let caption = domHelper.getById('caption');
        domHelper.setProperty(caption, 'innerHTML', currentCaption);
      },
    });

    if (subtitlesLane2) {
      subtitlesLane2.addTimelineNode({
        width: 30,
        height: 22,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: subDkLabel,
      });

      subtitlesLane2.addTimelineNode({
        width: 110,
        height: 20,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: new omakase.TextLabel({
          text: `Sidecar Subtitle`,
          listening: false,
          style: {
            align: 'center',
            verticalAlign: 'middle',
            fill: '#000000',
            fontSize: 15,
          },
        }),
      });
    }

    let stereoAudioTrackLane = createNewAudioTrackLane('', '', urls[urlSelector].audioLvl20);
    if (stereoAudioTrackLane) {
      omakasePlayer.timeline.addTimelineLane(stereoAudioTrackLane);
    }

    let stereoAudioTrackLaneR;
    let stereoAudioTrackLaneL;
    let stereoRmsBarChartLane;
    let lineChartLaneForMultipleMeasurements;

    if (stereoAudioTrackLane) {
      stereoAudioTrackLaneR = createNewAudioTrackLane('', 'Right channel', urls[urlSelector].audioLvl20R);
      if (stereoAudioTrackLaneR) {
        omakasePlayer.timeline.addTimelineLane(stereoAudioTrackLaneR);
      }

      stereoAudioTrackLaneL = createNewAudioTrackLane('', 'Left channel', urls[urlSelector].audioLvl20L);
      if (stereoAudioTrackLaneL) {
        omakasePlayer.timeline.addTimelineLane(stereoAudioTrackLaneL);
      }

      if (urls[urlSelector].rms) {
        stereoRmsBarChartLane = new omakase.BarChartLane({
          vttUrl: urls[urlSelector].rms,
          description: 'Overall RMS Level',
          valueMax: 54, // optional custom max value, if not provided it will be resolved from data
          valueMin: 0, // optional custom min value, if not provided it will be resolved from data
          style: {
            interpolationWidth: 8,
            backgroundFill: '#E9F7FF',
            height: 60,
            leftBackgroundFill: '#E4E5E5',
            margin: 0,
          },
          valueTransformFn: (value) => {
            // each value can be transformed in this hook function
            return value + 54 > 0 ? value + 54 : 0;
          },
          itemProcessFn: (item, index) => {
            // each chart item can be processed in this hook function
            item.onClick$.subscribe({
              next: (event) => {
                console.log(event, item);
              },
            });
          },
          valueInterpolationStrategy: 'max', // average - take interpolated points average | max - take interpolated points max
        });

        omakasePlayer.timeline.addTimelineLane(stereoRmsBarChartLane);
      }

      if (urls[urlSelector].multipleMeasurements) {
        lineChartLaneForMultipleMeasurements = new omakase.LineChartLane({
          vttUrl: urls[urlSelector].multipleMeasurements,
          description: 'R128 Loudness',
          yMax: 0,
          yMin: -200,
          style: {
            pointWidth: 3,
            lineStrokeWidth: 2,
            fill: ['orange', 'green'],
            pointFill: '#00000022',
            backgroundFill: '#E9F7FF',
            height: 100,
            leftBackgroundFill: '#E4E5E5',
          },
        });

        omakasePlayer.timeline.addTimelineLane(lineChartLaneForMultipleMeasurements);

        lineChartLaneForMultipleMeasurements.addTimelineNode({
          width: 30,
          height: 30,
          justify: 'start',
          margin: [10, 10, 0, 2],
          timelineNode: legendButton_20,
        });

        legendButton_20.onClick$.subscribe({
          next: (event) => {
            if (domHelper.getById('legend-box-20')) {
              let legendBox = domHelper.getById('legend-box-20');
              domHelper.toggleLegendBox(legendButton_20, false, legendInactive, legendBox);
            } else {
              domHelper.toggleLegendBox(legendButton_20, true, legendActive, undefined, event);
            }
          },
        });
      }
    }

    if (lineChartLaneForMultipleMeasurements) {
      lineChartLaneForMultipleMeasurements.style = { marginBottom: 1 };
    } else if (stereoRmsBarChartLane) {
      stereoRmsBarChartLane.style = { marginBottom: 1 };
    } else if (stereoAudioTrackLaneL) {
      stereoAudioTrackLaneL.style = { marginBottom: 1 };
    } else if (stereoAudioTrackLaneR) {
      stereoAudioTrackLaneR.style = { marginBottom: 1 };
    } else {
      stereoAudioTrackLane.style = { marginBottom: 1 };
    }

    let textLabel20 = new omakase.TextLabel({
      text: `2.0`,
      listening: true,
      style: {
        align: 'center',
        verticalAlign: 'middle',
        fill: '#ffffff',
        backgroundFill: '#f45844',
        backgroundBorderRadius: 3,
      },
    });

    textLabel20.onClick$.subscribe({
      next: (event) => {
        setActiveAudioTrack('2.0');
      },
    });

    omakasePlayer.audio.onAudioSwitched$.subscribe((event) => {
      if ('EN_20' !== omakasePlayer.audio.getActiveAudioTrack().label) {
        textLabel20.style = {
          backgroundFill: '#f45844',
        };
      } else {
        textLabel20.style = {
          backgroundFill: '#008000',
        };
      }
    });

    if (stereoAudioTrackLane) {
      stereoAudioTrackLane.addTimelineNode({
        width: 30,
        height: 22,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: textLabel20,
      });

      stereoAudioTrackLane.addTimelineNode({
        width: 30,
        height: 30,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: new omakase.ImageButton({
          src: `https://demo.player.byomakase.org/images/volume-off.svg`,
          width: 30,
          height: 30,
          listening: false,
        }),
      });
    }

    let iconMinimize20 = new omakase.ImageButton({
      src: `https://demo.player.byomakase.org/images/chevron-down.svg`,
      width: 20,
      height: 20,
      listening: true,
    });

    iconMinimize20.onClick$.subscribe({
      next: () => {
        const isMimimized = stereoAudioTrackLaneL
          ? stereoAudioTrackLaneL.isMinimized()
          : stereoAudioTrackLaneR
            ? stereoAudioTrackLaneR.isMinimized()
            : stereoRmsBarChartLane
              ? stereoRmsBarChartLane.isMimimized()
              : stereoOveralRmsOgChartLane
                ? lineChartLaneForMultipleMeasurements.isMinimized()
                : false;

        stereoAudioTrackLaneL && stereoAudioTrackLaneL.toggleMinimizeMaximize();
        stereoAudioTrackLaneR && stereoAudioTrackLaneR.toggleMinimizeMaximize();
        stereoRmsBarChartLane && stereoRmsBarChartLane.toggleMinimizeMaximize();
        lineChartLaneForMultipleMeasurements && lineChartLaneForMultipleMeasurements.toggleMinimizeMaximize();

        let imageConfigExpanded = {
          src: `https://demo.player.byomakase.org/images/chevron-down.svg`,
          width: 20,
          height: 20,
          listening: true,
        };

        let imageConfigCollapsed = {
          src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
          width: 20,
          height: 20,
          listening: true,
        };

        stereoAudioTrackLane.style = {
          marginBottom: isMimimized ? 0 : 1,
        };

        let lane = omakasePlayer.timeline.getTimelineLanes().find((item) => {
          if (urls[urlSelector].multipleMeasurements) {
            return item.vttUrl === urls[urlSelector].multipleMeasurements;
          } else if (urls[urlSelector].rms) {
            return item.vttUrl === urls[urlSelector].rms;
          } else if (urls[urlSelector].audioLvl20L) {
            return item.vttUrl === urls[urlSelector].audioLvl20L;
          } else {
            return item.vttUrl === urls[urlSelector].audioLvl20R;
          }
        });

        if (lane) {
          lane.style = {
            marginBottom: isMimimized ? 1 : 0,
          };
        }
        const imageConfig = isMimimized ? imageConfigExpanded : imageConfigCollapsed;
        iconMinimize20.setImage(imageConfig);
      },
    });

    if (stereoAudioTrackLane) {
      stereoAudioTrackLane.addTimelineNode({
        width: 20,
        height: 20,
        justify: 'start',
        margin: [5, 25, 0, 0],
        timelineNode: iconMinimize20,
      });
    }

    let surroundAudioTrackLane = createNewAudioTrackLane('', '', urls[urlSelector].audioLvl51);
    if (surroundAudioTrackLane) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLane);
      surroundAudioTrackLane.style = {
        marginBottom: 1,
      };
    }

    let surroundAudioTrackLaneL;
    let surroundAudioTrackLaneR;
    let surroundAudioTrackLaneC;
    let surroundAudioTrackLaneLFE;
    let surroundAudioTrackLaneSL;
    let surroundAudioTrackLaneSR;

    if (surroundAudioTrackLane) {
      surroundAudioTrackLaneL = createNewAudioTrackLane('', 'Left channel', urls[urlSelector].audioLvl51L);
      if (surroundAudioTrackLaneL) {
        omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneL);
        surroundAudioTrackLaneL.minimize();
      }

      surroundAudioTrackLaneR = createNewAudioTrackLane('', 'Right channel', urls[urlSelector].audioLvl51R);
      if (surroundAudioTrackLaneR) {
        omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneR);
        surroundAudioTrackLaneR.minimize();
      }

      surroundAudioTrackLaneC = createNewAudioTrackLane('', 'Center channel', urls[urlSelector].audioLvl51C);
      if (surroundAudioTrackLaneC) {
        omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneC);
        surroundAudioTrackLaneC.minimize();
      }

      surroundAudioTrackLaneLFE = createNewAudioTrackLane('', 'LFE channel', urls[urlSelector].audioLvl51LFE);
      if (surroundAudioTrackLaneLFE) {
        omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneLFE);
        surroundAudioTrackLaneLFE.minimize();
      }

      surroundAudioTrackLaneSL = createNewAudioTrackLane('', 'Surround Left channel', urls[urlSelector].audioLvl51SL);
      if (surroundAudioTrackLaneSL) {
        omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneSL);
        surroundAudioTrackLaneSL.minimize();
      }

      surroundAudioTrackLaneSR = createNewAudioTrackLane('', 'Surround Right channel', urls[urlSelector].audioLvl51SR);
      if (surroundAudioTrackLaneSR) {
        omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneSR);
        surroundAudioTrackLaneSR.minimize();
      }
    }

    let textLabel51 = new omakase.TextLabel({
      text: `5.1`,
      listening: true,
      style: {
        align: 'center',
        verticalAlign: 'middle',
        fill: '#ffffff',
        backgroundFill: '#008000',
        backgroundBorderRadius: 3,
      },
    });

    omakasePlayer.audio.onAudioSwitched$.subscribe((event) => {
      if ('EN_51' !== omakasePlayer.audio.getActiveAudioTrack().label) {
        textLabel51.style = {
          backgroundFill: '#f45844',
        };
      } else {
        textLabel51.style = {
          backgroundFill: '#008000',
        };
      }
    });

    textLabel51.onClick$.subscribe({
      next: (event) => {
        setActiveAudioTrack('5.1');
      },
    });

    if (surroundAudioTrackLane) {
      surroundAudioTrackLane.addTimelineNode({
        width: 30,
        height: 22,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: textLabel51,
      });

      surroundAudioTrackLane.addTimelineNode({
        width: 30,
        height: 30,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: new omakase.ImageButton({
          src: `https://demo.player.byomakase.org/images/volume-off.svg`,
          width: 30,
          height: 30,
          listening: false,
        }),
      });
    }

    let iconMinimize51 = new omakase.ImageButton({
      src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
      width: 20,
      height: 20,
      listening: true,
    });

    iconMinimize51.onClick$.subscribe({
      next: () => {
        const isMimimized = surroundAudioTrackLaneL
          ? surroundAudioTrackLaneL.isMinimized()
          : surroundAudioTrackLaneR
            ? surroundAudioTrackLaneR.isMinimized()
            : surroundAudioTrackLaneC
              ? surroundAudioTrackLaneC.isMinimized()
              : surroundAudioTrackLaneLFE
                ? surroundAudioTrackLaneLFE.isMinimized()
                : surroundAudioTrackLaneSL
                  ? surroundAudioTrackLaneSL.isMinimized()
                  : surroundAudioTrackLaneSR
                    ? surroundAudioTrackLaneSR.isMinimized()
                    : false;

        surroundAudioTrackLaneL && surroundAudioTrackLaneL.toggleMinimizeMaximize();
        surroundAudioTrackLaneR && surroundAudioTrackLaneR.toggleMinimizeMaximize();
        surroundAudioTrackLaneC && surroundAudioTrackLaneC.toggleMinimizeMaximize();
        surroundAudioTrackLaneLFE && surroundAudioTrackLaneLFE.toggleMinimizeMaximize();
        surroundAudioTrackLaneSL && surroundAudioTrackLaneSL.toggleMinimizeMaximize();
        surroundAudioTrackLaneSR && surroundAudioTrackLaneSR.toggleMinimizeMaximize();

        let imageConfigExpanded = {
          src: `https://demo.player.byomakase.org/images/chevron-down.svg`,
          width: 20,
          height: 20,
          listening: true,
        };
        let imageConfigCollapsed = {
          src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
          width: 20,
          height: 20,
          listening: true,
        };

        surroundAudioTrackLane.style = {
          marginBottom: isMimimized ? 0 : 1,
        };

        let lane = omakasePlayer.timeline.getTimelineLanes().find((item) => {
          if (urls[urlSelector].audioLvl51SR) {
            return item.vttUrl === urls[urlSelector].audioLvl51SR;
          } else if (urls[urlSelector].audioLvl51SL) {
            return item.vttUrl === urls[urlSelector].audioLvl51SL;
          } else if (urls[urlSelector].audioLvl51LFE) {
            return item.vttUrl === urls[urlSelector].audioLvl51LFE;
          } else if (urls[urlSelector].audioLvl51C) {
            return item.vttUrl === urls[urlSelector].audioLvl51C;
          } else if (urls[urlSelector].audioLvl51R) {
            return item.vttUrl === urls[urlSelector].audioLvl51R;
          } else {
            return item.vttUrl === urls[urlSelector].audioLvl51L;
          }
        });

        if (lane) {
          lane.style = {
            marginBottom: isMimimized ? 1 : 0,
          };
        }

        const imageConfig = isMimimized ? imageConfigExpanded : imageConfigCollapsed;
        iconMinimize51.setImage(imageConfig);
      },
    });

    if (surroundAudioTrackLane) {
      surroundAudioTrackLane.addTimelineNode({
        width: 20,
        height: 20,
        justify: 'start',
        margin: [5, 25, 0, 0],
        timelineNode: iconMinimize51,
      });
    }

    let scrollbarLane = new omakase.ScrollbarLane({
      description: '',
      style: {
        backgroundFill: '#EDEFFE',
        height: 25,
        leftBackgroundFill: '#E4E5E5',
      },
    });

    omakasePlayer.timeline.addTimelineLane(scrollbarLane);

    // Listening for embedded subtitles load
    processSubtitles();
  });

  initializePlayerControlButtons();
}

function processSubtitles() {
  omakasePlayer.subtitles.onSubtitlesLoaded$.subscribe((event) => {
    if (event === undefined) {
      return;
    }

    let subtitlesVttTracks = omakasePlayer.subtitles.getTracks();

    if (subtitlesVttTracks?.[0]) {
      let enClosedCaptionLane = new omakase.SubtitlesLane({
        description: '',
        vttUrl: subtitlesVttTracks?.[0].src,
        style: {
          backgroundFill: '#E9F7FF',
          height: 40,
          leftBackgroundFill: '#E4E5E5',
          subtitlesLaneItemOpacity: 0.7,
          subtitlesLaneItemFill: '#87D798',
          paddingTop: 10,
          paddingBottom: 10,
          marginBottom: 1,
        },
      });

      let ind = omakasePlayer.timeline.getTimelineLanes().findIndex((item) => item instanceof omakase.SubtitlesLane || item instanceof omakase.AudioTrackLane);
      if (ind !== -1) {
        omakasePlayer.timeline.addTimelineLaneAtIndex(enClosedCaptionLane, ind);
      } else {
        ind = omakasePlayer.timeline.getTimelineLanes().length - 1;
        omakasePlayer.timeline.addTimelineLaneAtIndex(enClosedCaptionLane, ind);
      }

      let capEnLabel = new omakase.TextLabel({
        text: `EN`,
        listening: true,
        style: {
          align: 'center',
          verticalAlign: 'middle',
          fill: '#ffffff',
          backgroundFill: '#008000',
          backgroundBorderRadius: 3,
        },
      });

      omakasePlayer.subtitles.onShow$.subscribe((event) => {
        if ('eng' !== omakasePlayer.subtitles.getActiveTrack().language) {
          capEnLabel.style = {
            backgroundFill: '#f45844',
          };
        } else {
          capEnLabel.style = {
            backgroundFill: '#008000',
          };
        }
      });

      capEnLabel.onClick$.subscribe({
        next: (event) => {
          currentCaption = 'EN';
          omakasePlayer.subtitles.showTrack(omakasePlayer.subtitles.getTracks()[0].id);
          let caption = domHelper.getById('caption');
          domHelper.setProperty(caption, 'innerHTML', currentCaption);
        },
      });

      enClosedCaptionLane.addTimelineNode({
        width: 30,
        height: 22,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: capEnLabel,
      });

      enClosedCaptionLane.addTimelineNode({
        width: 110,
        height: 20,
        justify: 'end',
        margin: [0, 5, 0, 0],
        timelineNode: new omakase.TextLabel({
          text: `Embedded CC`,
          listening: false,
          style: {
            align: 'center',
            verticalAlign: 'middle',
            fill: '#000000',
            fontSize: 15,
          },
        }),
      });
    }

    // setTimeout(() => {
    //     omakasePlayer.subtitles.showTrack(subtitlesVttTracks?.[0].id)
    // }, 2000)

    // Adding sidecar subtitle to player subtitle selector
    if (urls[urlSelector].dkSubtitle) {
      const daDkSubtitles = omakasePlayer.subtitles
        .createVttTrack({
          id: '1',
          src: urls[urlSelector].dkSubtitle,
          label: 'DK',
          language: 'da-dk',
          default: false,
        })
        .subscribe((daDkSubtitles) => {
          console.debug(daDkSubtitles);
        });
    }
  });
}

function createNewAudioTrackLane(id, description, url) {
  if (url) {
    return new omakase.AudioTrackLane({
      id: id,
      description: description,
      vttUrl: url,
      style: {
        backgroundFill: '#E9F7FF',
        paddingTop: 0,
        paddingBottom: 0,
        height: 40,
        itemWidth: 3,
        itemMinPadding: 1,
        itemCornerRadius: 2,
        maxSampleFillLinearGradientColorStops: [0, '#ff0099', 0.2, 'yellow', 1, 'green'],
        minSampleFillLinearGradientColorStops: [0, 'green', 0.8, 'yellow', 1, 'red'],
        leftBackgroundFill: '#E4E5E5',
      },
    });
  }

  return;
}

function createDropdownMenu() {
  let header = domHelper.querySelector('.header');

  let dropdownMenu = domHelper.create('select');
  domHelper.setProperty(dropdownMenu, 'id', 'dropdown-menu');
  domHelper.setStyle(dropdownMenu, {
    width: '100px',
    height: '30px',
    padding: '5px 0px 5px 5px',
    margin: '10px 0px 10px 10px',
    backgroundColor: '#235067',
    borderColor: '#235067',
    color: 'white',
    fontSize: '15px',
    cursor: 'pointer',
  });

  urls.forEach((item) => {
    let option = domHelper.create('option');
    domHelper.setProperty(option, 'value', item.video);
    domHelper.setProperty(option, 'innerHTML', item.name);
    domHelper.appendChildren(dropdownMenu, [option]);
  });

  dropdownMenu.onchange = (event) => {
    urlSelector = event.target[event.target.selectedIndex].text.split(' ')[1] - 1;
    reloadVideoAndTimeline(event.target.value);
  };

  domHelper.appendChildren(header, [dropdownMenu]);
}

function createMLCAndRVCSwitcher() {
  const MLC = domHelper.getById('player-stats');
  const RVC = domHelper.getById('omakase-audio-router');
  const mlcTab = domHelper.getById('tab-mlc');
  const rvcTab = domHelper.getById('tab-rvc');

  mlcTab.onclick = () => {
    domHelper.setStyle(RVC, { display: 'none' });
    domHelper.setStyle(MLC, { display: 'inline-block' });
    mlcTab.classList.add('active');
    rvcTab.classList.remove('active');
  };

  rvcTab.onclick = () => {
    domHelper.setStyle(MLC, { display: 'none' });
    domHelper.setStyle(RVC, { display: 'inline-block' });
    rvcTab.classList.add('active');
    mlcTab.classList.remove('active');
  };
}

function initializePlayerEventListeners() {
  omakasePlayer.video.onVideoTimeChange$.subscribe((event) => {
    let inputFrameSeek = domHelper.getById('inputFrameSeek');
    domHelper.setProperty(inputFrameSeek, 'innerHTML', event.frame);

    let inputTimestamp = domHelper.getById('inputTimestamp');
    domHelper.setProperty(inputTimestamp, event.currentTime.toFixed(3));

    let inputTimestampFormatted = domHelper.getById('inputTimestampFormatted');
    domHelper.setProperty(inputTimestampFormatted, 'innerHTML', omakasePlayer.video.formatToTimecode(event.currentTime));
  });

  omakasePlayer.video.onSeeked$.subscribe((event) => {
    let buttonReplay = domHelper.getById('buttonReplay');
    domHelper.setStyle(buttonReplay, { display: 'none' });

    if (omakasePlayer.video.isPlaying()) {
      let buttonPause = domHelper.getById('buttonPause');
      domHelper.setStyle(buttonPause, { display: 'inline' });

      let buttonPlay = domHelper.getById('buttonPlay');
      domHelper.setStyle(buttonPlay, { display: 'none' });
    } else {
      let buttonPause = domHelper.getById('buttonPause');
      domHelper.setStyle(buttonPause, { display: 'none' });

      let buttonPlay = domHelper.getById('buttonPlay');
      domHelper.setStyle(buttonPlay, { display: 'inline' });
    }
  });

  omakasePlayer.video.onEnded$.subscribe((event) => {
    let buttonReplay = domHelper.getById('buttonReplay');
    domHelper.setStyle(buttonReplay, { display: 'inline' });

    let buttonPause = domHelper.getById('buttonPause');
    domHelper.setStyle(buttonPause, { display: 'none' });

    let buttonPlay = domHelper.getById('buttonPlay');
    domHelper.setStyle(buttonPlay, { display: 'none' });
  });

  omakasePlayer.video.onVideoLoaded$.subscribe((event) => {
    console.debug('Video Loaded', event);

    if (!event) {
      return;
    }

    omakasePlayer.video.onPlay$.subscribe(() => {
      let buttonReplay = domHelper.getById('buttonReplay');
      domHelper.setStyle(buttonReplay, { display: 'none' });

      let buttonPause = domHelper.getById('buttonPause');
      domHelper.setStyle(buttonPause, { display: 'inline' });

      let buttonPlay = domHelper.getById('buttonPlay');
      domHelper.setStyle(buttonPlay, { display: 'none' });
    });

    omakasePlayer.video.onPause$.subscribe(() => {
      let buttonReplay = domHelper.getById('buttonReplay');
      domHelper.setStyle(buttonReplay, { display: 'none' });

      let buttonPause = domHelper.getById('buttonPause');
      domHelper.setStyle(buttonPause, { display: 'none' });

      let buttonPlay = domHelper.getById('buttonPlay');
      domHelper.setStyle(buttonPlay, { display: 'inline' });
    });
  });
}

function initializePlayerControlButtons() {
  let buttonPlay = domHelper.getById('buttonPlay');
  buttonPlay.onclick = function () {
    omakasePlayer.video.play();
  };

  let buttonPause = domHelper.getById('buttonPause');
  buttonPause.onclick = function () {
    omakasePlayer.video.pause();
  };

  let buttonReplay = domHelper.getById('buttonReplay');
  buttonReplay.onclick = function () {
    omakasePlayer.video.seekToFrame(0);
  };

  let buttonFfBack = domHelper.getById('ff-back');
  buttonFfBack.onclick = function () {
    omakasePlayer.video.pause().subscribe({
      next: () => {
        let frame = omakasePlayer.video.getCurrentFrame();
        if (frame < 10) {
          frame = 0;
        } else {
          frame = frame - 10;
        }
        omakasePlayer.video.seekToFrame(frame);
      }
    });


  };

  let buttonBack = domHelper.getById('back');
  buttonBack.onclick = function () {
    omakasePlayer.video.pause().subscribe({
      next: () => {
        omakasePlayer.video.seekPreviousFrame();
      }
    });

  };

  let buttonFfForward = domHelper.getById('ff-forward');
  buttonFfForward.onclick = function () {
    omakasePlayer.video.pause().subscribe({
      next: () => {
        let frame = omakasePlayer.video.getCurrentFrame();
        if (frame + 10 >= omakasePlayer.video.getVideo().totalFrames) {
          frame = omakasePlayer.video.getVideo().totalFrames;
        } else {
          frame = frame + 10;
        }
        omakasePlayer.video.seekToFrame(frame);
      }
    });
  };

  let buttonForward = domHelper.getById('forward');
  buttonForward.onclick = function () {
    omakasePlayer.video.pause().subscribe({
      next: () => {
        let frame = omakasePlayer.video.getCurrentFrame();
        if (frame + 1 >= omakasePlayer.video.getVideo().totalFrames) {
          frame = omakasePlayer.video.getVideo().totalFrames;
        } else {
          frame = frame + 1;
        }
        omakasePlayer.video.seekToFrame(frame);
      }
    });
  };

  // Playback rate toggle and indicator
  let buttonPlayback = domHelper.getById('playback');
  buttonPlayback.onclick = function () {
    togglePlayback();
  };

  // Audio toggle and indicator
  let buttonMute = domHelper.getById('mute');
  let muted = false;
  buttonMute.onclick = function () {
    if (muted) {
      domHelper.setStyle(buttonMute, { opacity: '1' });
      omakasePlayer.video.unmute();
      muted = false;
    } else {
      domHelper.setStyle(buttonMute, { opacity: '0.5' });
      omakasePlayer.video.mute();
      muted = true;
    }
  };
  let buttonAudio = domHelper.getById('audio');
  buttonAudio.onclick = function () {
    toggleAudio();
  };

  // Captions toggle and indicator
  let buttonSub = domHelper.getById('sub');
  buttonSub.onclick = function () {
    let activeTrack = omakasePlayer.subtitles.getActiveTrack();
    if (activeTrack.hidden) {
      omakasePlayer.subtitles.showActiveTrack();
      domHelper.setStyle(buttonSub, { opacity: '1' });
    } else {
      omakasePlayer.subtitles.hideActiveTrack();
      domHelper.setStyle(buttonSub, { opacity: '0.5' });
    }
  };
  let buttonCaption = domHelper.getById('caption');
  buttonCaption.onclick = function () {
    toggleCaptions();
    domHelper.setProperty(buttonCaption, 'innerHTML', currentCaption);
  };

  let buttonPlayheadToIn = domHelper.getById('playhead-to-in');
  buttonPlayheadToIn.onclick = setPlayheadToInMarker;

  let buttonPlayheadToOut = domHelper.getById('playhead-to-out');
  buttonPlayheadToOut.onclick = setPlayheadToOutMarker;

  let buttonInToPlayhead = domHelper.getById('in-to-playhead');
  buttonInToPlayhead.onclick = setInMarkerToPlayhead;

  let buttonOutToPlayhead = domHelper.getById('out-to-playhead');
  buttonOutToPlayhead.onclick = setOutMarkertoPlayhead;

  let buttonSafeZoneOn = domHelper.getById('safe-zone-on');
  buttonSafeZoneOn.onclick = function () {
    enableSafeZone(true);
  };

  let buttonSafeZoneOff = domHelper.getById('safe-zone-off');
  buttonSafeZoneOff.onclick = function () {
    enableSafeZone(false);
  };

  let videoElement = omakasePlayer.video.getHTMLVideoElement();

  videoElement.addEventListener('enterpictureinpicture', (event) => {
    if (event instanceof PictureInPictureEvent) {
      togglePIP(true);
      let op = domHelper.querySelector('.omakase-video-controls');
      domHelper.setProperty(op, 'className', 'omakase-video-controls d-none');
    } else {
      alert('Picture in Picture mode failed');
    }
  });

  videoElement.addEventListener('leavepictureinpicture', (event) => {
    if (event instanceof PictureInPictureEvent) {
      togglePIP(false);
      let op = domHelper.querySelector('.omakase-video-controls');
      domHelper.setProperty(op, 'className', 'omakase-video-controls');
    } else {
      alert('Picture in Picture mode failed');
    }
  });

  let userAgent = (window.navigator && window.navigator.userAgent) || '';
  let isFirefox = /Firefox/i.test(userAgent);
  if (!isFirefox) {
    let detachPIP = domHelper.getById('detach-pip');
    detachPIP.onclick = async function () {
      if (!domHelper.getPIP() && !videoElement.disablePictureInPicture && document.pictureInPictureEnabled) {
        domHelper.requestPIP(videoElement);
      }
    };

    let attachPIP = domHelper.getById('attach-pip');
    attachPIP.onclick = async function () {
      if (domHelper.getPIP() && !videoElement.disablePictureInPicture && document.pictureInPictureEnabled) {
        domHelper.exitPIP();
      }
    };
  } else {
    let detachPIP = domHelper.getById('detach-pip');
    domHelper.setStyle(detachPIP, { display: 'none' });
    let attachPIP = domHelper.getById('attach-pip');
    domHelper.setStyle(attachPIP, { display: 'none' });
  }

  let buttonFullscreen = domHelper.getById('full-screen');
  buttonFullscreen.onclick = function () {
    omakasePlayer.video.toggleFullscreen();
  };
}

function togglePIP(isActive) {
  let detachPIP = domHelper.getById('detach-pip');
  let attachPIP = domHelper.getById('attach-pip');

  domHelper.setStyle(detachPIP, { display: isActive ? 'none' : 'inline' });
  domHelper.setStyle(attachPIP, { display: isActive ? 'inline' : 'none' });
}

function uninitializeVuMeter() {
  if (audioContext) {
    let peakMeter = domHelper.getById('peak-meter');
    domHelper.setProperty(peakMeter, 'innerHTML', '');
  }
}

function initializeVuMeter(event) {
  if (!audioContext) {
    domHelper.removeEventListener('keydown', initializeVuMeter);
    domHelper.removeEventListener('mousedown', initializeVuMeter);

    audioContext = omakasePlayer.video.getAudioContext();

    let omakaseVideo = domHelper.getByClassName('omakase-video')[0];

    domHelper.setProperty(omakaseVideo, 'volume', 1);
    var meterElement = domHelper.getById('peak-meter');
    const peakMeterConfig = {
      backgroundColor: '#EEEFEE',
      tickColor: '#70849A',
      labelColor: '#70849A',
      fontSize: 12,
      dbRange: 60,
      dbTickSize: 6,
      font: 'Arial',
      vertical: true,
    };

    const vm = new vuMeter.VuMeter(6, meterElement, peakMeterConfig).attachSource(omakasePlayer.audio.createMainAudioPeakProcessor());
  }
}

function keyListener(event) {
  if (event.code === 'KeyP') {
    // Play
    omakasePlayer.video.play();
  } else if (event.code === 'KeyK' && event.metaKey) {
    // Pause
    omakasePlayer.video.pause();
  } else if (event.code === 'ArrowRight') {
    // Navigate 1 frame forward
    seekNextFrame();
  } else if (event.code === 'ArrowLeft') {
    // Navigate 1 frame backward
    seekPreviousFrame();
  } else if (event.code === 'ArrowUp' && event.shiftKey && !event.metaKey) {
    // Navigate 1 sec forward
    navigateForwardsInSeconds(1);
  } else if (event.code === 'ArrowDown' && event.shiftKey && !event.metaKey) {
    // Navigate 1 sec backward
    navigateBackwardsInSeconds(1);
  } else if (event.code === 'ArrowUp' && event.metaKey && !event.shiftKey) {
    event.preventDefault();
    // Navigate 10 sec forward
    navigateForwardsInSeconds(10);
  } else if (event.code === 'ArrowDown' && event.metaKey && !event.shiftKey) {
    event.preventDefault();
    // Navigate 10 sec backward
    navigateBackwardsInSeconds(10);
  } else if (event.code === 'KeyF') {
    // Toggle fullscreen
    omakasePlayer.video.toggleFullscreen();
  } else if (event.code === 'KeyI' && !event.shiftKey) {
    // Set IN marker to playhead
    setInMarkerToPlayhead();
  } else if (event.code === 'KeyO' && !event.shiftKey) {
    // Set OUT marker to playhead
    setOutMarkertoPlayhead();
  } else if (event.code === 'KeyI' && event.shiftKey) {
    // Set playhead to IN marker
    setPlayheadToInMarker();
  } else if (event.code === 'KeyO' && event.shiftKey) {
    // Set playhead to OUT marker
    setPlayheadToOutMarker();
  } else if (event.code === 'Digit1' && !event.ctrlKey && event.shiftKey) {
    // Add new marker at playhead
    console.debug(event.target);
    addMarker();
  } else if (event.code === 'Digit2' && !event.ctrlKey && event.shiftKey) {
    // Toggle between markers
    toggleNextMarker();
  } else if (event.code === 'Digit2' && event.ctrlKey && event.shiftKey) {
    // Playback rate 0.25x
    setPlaybackRate(0.25);
  } else if (event.code === 'Digit3' && event.ctrlKey && event.shiftKey) {
    // Playback rate 0.5x
    setPlaybackRate(0.5);
  } else if (event.code === 'Digit4' && event.ctrlKey && event.shiftKey) {
    // Playback rate 0.75x
    setPlaybackRate(0.75);
  } else if (event.code === 'Digit5' && event.ctrlKey && event.shiftKey) {
    // Playback rate 1x
    setPlaybackRate(1);
  } else if (event.code === 'Digit6' && event.ctrlKey && event.shiftKey) {
    // Playback rate 2x
    setPlaybackRate(2);
  } else if (event.code === 'Digit7' && event.ctrlKey && event.shiftKey) {
    // Playback rate 4x
    setPlaybackRate(4);
  } else if (event.code === 'Digit8' && event.ctrlKey && event.shiftKey) {
    // Playback rate 8x
    setPlaybackRate(8);
  }
}

function seekPreviousFrame() {
  omakasePlayer.video.pause().subscribe({
    next: () => {
      omakasePlayer.video.seekPreviousFrame();
    }
  });
}

function seekNextFrame() {
  omakasePlayer.video.pause().subscribe({
    next: () => {
      let frame = omakasePlayer.video.getCurrentFrame();
      if (frame + 1 >= omakasePlayer.video.getVideo().totalFrames) {
        frame = omakasePlayer.video.getVideo().totalFrames;
      } else {
        frame = frame + 1;
      }
      omakasePlayer.video.seekToFrame(frame);
    }
  })

}

function navigateBackwardsInSeconds(numOfSecs) {
  omakasePlayer.video.pause().subscribe({
    next: () => {
      let frameRate = omakasePlayer.video.getFrameRate();
      let frame = omakasePlayer.video.getCurrentFrame();
      let framesToMove = numOfSecs * frameRate;
      console.debug('Frames to move backwards', framesToMove);

      if (framesToMove > frame) {
        frame = 0;
      } else {
        frame = frame - framesToMove;
      }
      omakasePlayer.video.seekToFrame(frame);
    }
  })
}

function navigateForwardsInSeconds(numOfSecs) {
  omakasePlayer.video.pause().subscribe({
    next: () => {

      let frameRate = omakasePlayer.video.getFrameRate();
      let frame = omakasePlayer.video.getCurrentFrame();
      let totalFrames = omakasePlayer.video.getVideo().totalFrames;
      let framesToMove = numOfSecs * frameRate;
      console.debug('Frames to move forwards', framesToMove);

      if (frame + framesToMove >= totalFrames) {
        frame = totalFrames;
      } else {
        frame = frame + framesToMove;
      }
      omakasePlayer.video.seekToFrame(frame);
    }
  })
}

function setInMarkerToPlayhead() {
  if (!activeMarker) {
    return;
  }

  console.debug('set IN Marker to Playhead', activeMarker.id);

  let playhead = omakasePlayer.video.getCurrentTime();
  let timeObservation = activeMarker.timeObservation;
  if (playhead <= timeObservation.end) {
    timeObservation.start = playhead;
    omakaseMarkerList.updateMarker(activeMarker.id, { timeObservation });
  }
}

function setOutMarkertoPlayhead() {
  if (!activeMarker) {
    return;
  }

  console.debug('set OUT Marker to Playhead', activeMarker.id);

  let playhead = omakasePlayer.video.getCurrentTime();
  let timeObservation = activeMarker.timeObservation;
  if (timeObservation.start <= playhead) {
    timeObservation.end = playhead;
    omakaseMarkerList.updateMarker(activeMarker.id, { timeObservation });
  }
}

function setPlayheadToInMarker() {
  if (!activeMarker) {
    return;
  }

  console.debug('set Playhead to IN Marker', activeMarker.id);
  let inTimeStamp = activeMarker.timeObservation.start;
  omakasePlayer.video.seekToTime(inTimeStamp);
}

function setPlayheadToOutMarker() {
  if (!activeMarker) {
    return;
  }

  console.debug('set Playhead to OUT Marker', activeMarker.id);
  let outTimeStamp = activeMarker.timeObservation.end;
  omakasePlayer.video.seekToTime(outTimeStamp);
}

function addMarker() {
  console.debug('Adding marker at frame', omakasePlayer.video.getCurrentFrame());
  let inAndOutMarkersLane = omakasePlayer.timeline.getTimelineLane('in_and_out_markers_lane');
  if (inAndOutMarkersLane.getMarkers().length >= maxMarkerCount) {
    return;
  }
  let color = markerColors[markerCount % markerColors.length];
  const marker = inAndOutMarkersLane.createPeriodMarker({
    text: `Marker ` + markerCount,
    timeObservation: {
      start: omakasePlayer.video.getCurrentTime(),
      end: omakasePlayer.video.getCurrentTime() + 20,
    },
    style: {
      symbolType: 'triangle',
      color: color,
      renderType: 'lane',
    },
    editable: true,
  });

  omakaseMarkerList.toggleMarker(marker.id);
  activeMarker = omakaseMarkerList.getSelectedMarker();
  markerCount++;

  updateAddMarkerButton();
}

function toggleNextMarker() {
  const lane = omakasePlayer.timeline.getTimelineLane('in_and_out_markers_lane');
  if (!lane.getMarkers().length) {
    return;
  }
  const currentActiveMarker = omakaseMarkerList.getSelectedMarker();
  const markerIndex = currentActiveMarker ? lane.getMarkers().findIndex((m) => m.id === currentActiveMarker.id) : -1;
  const nextMarker = lane.getMarkers()[(markerIndex + 1) % lane.getMarkers().length];
  omakaseMarkerList.toggleMarker(nextMarker.id);
  activeMarker = omakaseMarkerList.getSelectedMarker();
}

function updateAddMarkerButton() {
  const addMarkerButton = domHelper.getById('addMarker');
  const inAndOutMarkersLane = omakasePlayer.timeline.getTimelineLane('in_and_out_markers_lane');
  domHelper.setStyle(addMarkerButton, {
    display: inAndOutMarkersLane.getMarkers().length >= maxMarkerCount ? 'none' : '',
  });
}

function setPlaybackRate(speed) {
  omakasePlayer.video.setPlaybackRate(speed);
  currentSpeed = speed;
  let playback = domHelper.getById('playback');
  domHelper.setProperty(playback, 'innerHTML', 'Speed: ' + speed + 'x');
}

function togglePlayback() {
  let activeSpeedIndex = speeds.indexOf(currentSpeed);

  if (activeSpeedIndex === speeds.length - 1) {
    setPlaybackRate(speeds[0]);
  } else {
    setPlaybackRate(speeds[activeSpeedIndex + 1]);
  }
}

function toggleCaptions() {
  let activeCaptionIndex = captions.indexOf(currentCaption);
  let subtitlesVttTracks = omakasePlayer.subtitles.getTracks();
  if (activeCaptionIndex === captions.length - 1) {
    currentCaption = captions[0];
    omakasePlayer.subtitles.showTrack(subtitlesVttTracks[0].id);
  } else {
    currentCaption = captions[activeCaptionIndex + 1];
    omakasePlayer.subtitles.showTrack(subtitlesVttTracks[activeCaptionIndex + 1].id);
  }
}

function toggleAudio() {
  let activeAudioIndex = audios.indexOf(currentAudio);
  let activeAudio;

  if (activeAudioIndex === audios.length - 1) {
    activeAudio = audios[0];
  } else {
    activeAudio = audios[1];
  }

  setActiveAudioTrack(activeAudio);
}

function setActiveAudioTrack(audio) {
  if ('5.1' === audio) {
    omakasePlayer.audio.setActiveAudioTrack('0').subscribe(() => {
      router.updateMainTrack({
        name: '5.1',
        inputLabels: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs']
      })
    });
    let vuLabelSurround = domHelper.getById('vu-label-surround');
    domHelper.setStyle(vuLabelSurround, { display: 'inline-block' });
  } else {
    omakasePlayer.audio.setActiveAudioTrack('1').subscribe(() => {
      router.updateMainTrack({
        name: '2.0',
        inputLabels: ['L', 'R']
      });
    });
    let vuLabelSurround = domHelper.getById('vu-label-surround');
    domHelper.setStyle(vuLabelSurround, { display: 'none' });
  }
  currentAudio = audio;
  let _audio = domHelper.getById('audio');
  domHelper.setProperty(_audio, 'innerHTML', currentAudio);
}

function enableSafeZone(safeZone) {
  let safeZoneOn = domHelper.getById('safe-zone-on');
  let safeZoneoOff = domHelper.getById('safe-zone-off');

  if (safeZone) {
    omakasePlayer.video.clearSafeZones();
    domHelper.setStyle(safeZoneOn, { display: 'none' });
    domHelper.setStyle(safeZoneoOff, { display: 'inline' });
  } else {
    omakasePlayer.video.addSafeZone({
      topRightBottomLeftPercent: [10, 10, 10, 10],
    });
    omakasePlayer.video.addSafeZone({
      topRightBottomLeftPercent: [20, 20, 20, 20],
    });
    domHelper.setStyle(safeZoneOn, { display: 'inline' });
    domHelper.setStyle(safeZoneoOff, { display: 'none' });
  }
}

function addZoomButtons() {
  let scrubberLane = omakasePlayer.timeline.getScrubberLane();

  // define zoom in button
  let zoomInButton = new omakase.ImageButton({
    src: `https://demo.player.byomakase.org/images/plus-circle.svg`,
    width: 20,
    height: 20,
    listening: true, // set to true if button is interactive
  });

  // handle click event
  zoomInButton.onClick$.subscribe({
    next: (event) => {
      omakasePlayer.timeline.zoomInEased().subscribe();
    },
  });

  // define zoom out button
  let zoomOutButton = new omakase.ImageButton({
    src: `https://demo.player.byomakase.org/images/minus-circle.svg`,
    width: 20,
    height: 20,
    listening: true,
  });

  // handle click event
  zoomOutButton.onClick$.subscribe({
    next: (event) => {
      omakasePlayer.timeline.zoomOutEased().subscribe();
    },
  });

  // add buttons to scrubber lane
  [zoomOutButton, zoomInButton].forEach((button) => {
    scrubberLane.addTimelineNode({
      width: button.config.width,
      height: button.config.height,
      justify: 'end',
      margin: [8, 5, 5, 5],
      timelineNode: button,
    });
  });
}

function detectBrowser() {
  let userAgent = (window.navigator && window.navigator.userAgent) || '';

  let isAndroid = /Android/i.test(userAgent);
  let isFirefox = /Firefox/i.test(userAgent);
  let isEdge = /Edg/i.test(userAgent);
  let isChromium = /Chrome/i.test(userAgent) || /CriOS/i.test(userAgent);
  let isChrome = !isEdge && isChromium;
  let isSafari = /Safari/i.test(userAgent) && !isChrome && !isAndroid && !isEdge;

  let useChrome = 'For the best experience, please use Chrome browser.';
  if (isSafari) {
    alert('Audio meter and audio router are not supported in Safari browser. ' + useChrome);
    browserIsSafari = true;
  } else if (!isChrome && !isFirefox) {
    alert(useChrome);
  }
}

function subscribeToComments(poiLane) {
  return poiLane.onVideoCueEvent$.subscribe((event) => {
    if (event.action === 'entry') {
      const commentText = event.cue.text.replace(':COMMENT=', '');
      if (commentAlertId) {
        omakasePlayer.alerts.update(commentAlertId, commentText);
      } else {
        const alert = omakasePlayer.alerts.info(commentText);
        commentAlertId = alert.id;
      }
    }
  });
}

function subscribeToMeasurements(bitrateLane) {
  return bitrateLane.onVideoCueEvent$.subscribe((event) => {
    if (event.action === 'entry') {
      omakasePlayer.alerts.warn(`Bitrate: ${event.cue.value}`, { autodismiss: true, duration: 2500 });
    }
  });
}

function reloadVideoAndTimeline(url) {
  let buttonReplay = domHelper.getById('buttonReplay');
  domHelper.setStyle(buttonReplay, { display: 'none' });

  let buttonPause = domHelper.getById('buttonPause');
  domHelper.setStyle(buttonPause, { display: 'none' });

  let buttonPlay = domHelper.getById('buttonPlay');
  domHelper.setStyle(buttonPlay, { display: 'inline' });

  if (markerCount > maxMarkerCount) {
    let _addMarker = domHelper.create('span');
    domHelper.setProperty(_addMarker, 'id', 'addMarker');
    domHelper.setStyle(_addMarker, { cursor: 'pointer' });

    let img = domHelper.create('img');
    domHelper.setProperty(img, 'src', 'images/add.svg');
    domHelper.setStyle(img, { height: '12px', paddingLeft: '15px' });
    domHelper.append(_addMarker, [img]);

    let _markersTitle = domHelper.querySelector('.markers-title');
    domHelper.appendChildren(_markersTitle, [_addMarker]);
  }

  resetVariables();

  let buttonCaption = domHelper.getById('caption');
  domHelper.setProperty(buttonCaption, 'innerHTML', currentCaption);
  let buttonAudio = domHelper.getById('audio');
  domHelper.setProperty(buttonAudio, 'innerHTML', currentAudio);

  let ids = [];
  omakasePlayer.timeline.getTimelineLanes().forEach((lane) => ids.push(lane.id));
  omakasePlayer.timeline.removeTimelineLanes(ids);
  omakaseMarkerList.destroy();

  loadOmakaseVideo(url, urls[urlSelector].frameRate);
}

function resetVariables() {
  activeMarker = null;
  currentSpeed = 1;
  currentAudio = '5.1';
  currentCaption = 'EN';
  speeds = [0.25, 0.5, 0.75, 1, 2, 4, 8];
  captions = ['EN', 'DK'];
  audios = ['5.1', '2.0'];
  markerCount = 2;
  splitLaneId = 0;
  markerColors = ['#E4ABFF', '#6AC7F6', '#A007E8', '#FCD004', '#009CEB', '#5E1879', '#4D79A7', '#A481B5', '#5A6C80', '#2B299E', '#EE9247', '#520160', '#863800', '#CD5600'];
  omakasePlayer;
  activeAlertType = null;
  commentAlertId = null;
  commentSubscription = null;
  measurementSubscription = null;
}

const domHelper = {
  getById: (id) => {
    return document.getElementById(id);
  },
  removeEventListener: (event, listener) => {
    return document.removeEventListener(event, listener);
  },
  getByClassName: (name) => {
    return document.getElementsByClassName(name);
  },
  create: (elem) => {
    return document.createElement(elem);
  },
  querySelector: (selector) => {
    return document.querySelector(selector);
  },
  setStyle: (elem, style) => {
    for (let prop in style) {
      elem.style[prop] = style[prop];
    }
  },
  setProperty: (elem, prop, value) => {
    elem[prop] = value;
  },
  append: (parentElem, elems) => {
    elems.forEach((elem) => parentElem.append(elem));
  },
  appendChildren: (parentElem, children) => {
    children.forEach((child) => parentElem.appendChild(child));
  },
  getPIP: () => {
    return document.pictureInPictureElement;
  },
  requestPIP: async (elem) => {
    try {
      return await elem.requestPictureInPicture();
    } catch (error) {
      alert('Picture in picture mode failed');
    }
  },
  exitPIP: async () => {
    try {
      return await document.exitPictureInPicture();
    } catch (error) {
      alert('Picture in picture mode failed');
    }
  },
  toggleLegendBox: (legendButton, isShown, image, legendBox, event = undefined) => {
    if (isShown) {
      let legend = domHelper.create('div');
      let legendBoxMin = domHelper.create('div');
      let legendBoxAvg = domHelper.create('div');
      let minIcon = domHelper.create('div');
      let avgIcon = domHelper.create('div');
      let minText = domHelper.create('text');
      let avgText = domHelper.create('text');

      domHelper.setProperty(legend, 'id', 'legend-box-20');
      domHelper.setProperty(legend, 'className', 'legend-box');
      domHelper.setStyle(legend, {
        top: omakasePlayer.timeline.getTimecodedFloatingRelativePointerPosition().y + 'px',
        left: event.mouseEvent.clientX + 'px',
      });

      domHelper.setProperty(legendBoxMin, 'className', 'legend-box-item');
      domHelper.setProperty(minIcon, 'className', 'legend-box-min-icon');
      domHelper.setProperty(minText, 'innerHTML', 'Momentary');
      domHelper.setProperty(minText, 'className', 'legend-box-text');

      domHelper.setProperty(legendBoxAvg, 'className', 'legend-box-item');
      domHelper.setProperty(avgIcon, 'className', 'legend-box-avg-icon');
      domHelper.setProperty(avgText, 'innerHTML', 'Average (2s)');
      domHelper.setProperty(avgText, 'className', 'legend-box-text');

      domHelper.appendChildren(legendBoxMin, [minIcon, minText]);
      domHelper.appendChildren(legendBoxAvg, [avgIcon, avgText]);
      domHelper.appendChildren(legend, [legendBoxMin, legendBoxAvg]);

      domHelper.querySelector('.konvajs-content').appendChild(legend);

      legendButton.setImage(image);
    } else {
      legendBox.remove();
      legendButton.setImage(image);
    }
  },
};
