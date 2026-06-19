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

import {
  BarChartLane,
  ChromingTheme,
  ImageButton,
  LabelLane,
  LineChartLane,
  MarkerList,
  MarkerTrack,
  MarkerTrackLane,
  MediaTemporalFormat,
  OmakasePlayer,
  PlayerAudioType,
  RouterVisualization,
  ScrollbarLane,
  TextLabel,
  TextTrackLane,
  ThumbnailTrackLane,
  TrackSource,
  TrackType,
  VuMeter,
  VuMeterOrientation,
  MarkerTrackLaneEventType,
  TimedItemsTrackEventType,
  TimedItemsTrackEventEmitter,
  TimedItemsTrackItemEventType,
  UiEventType,
  PlayerEventType,
  PlayerAudioEventType,
  PlayerTextEventType,
  TimelineNodeEventType,
  MarkerListEventType,
  ThumbnailTrackLaneEventType,
  TimedItemTemporalUtil,
} from '@byomakase/omakase-player';

let activeMarker = null;
let activeMarkerIndex = -1;
let currentSpeed = 1;
let currentAudio = '5.1';
let currentCaption = 'EN';
let speeds = [0.25, 0.5, 0.75, 1, 2, 4, 8];
let captions = ['EN', 'DK'];
let audios = ['5.1', '2.0'];
let isPlaying = false;
let markerCount = 2;
let maxMarkerCount = 7;
let splitLaneId = 0;
let urlSelector = 0;
let markerColors = ['#E4ABFF', '#6AC7F6', '#A007E8', '#FCD004', '#009CEB', '#5E1879', '#4D79A7', '#A481B5', '#5A6C80', '#2B299E', '#EE9247', '#520160', '#863800', '#CD5600'];
let maxSampleFillLinearGradientColorStops = [1, 'red', 0.5, 'yellow', 0, 'green'];
let minSampleFillLinearGradientColorStops = [0, 'green', 0.5, 'yellow', 1, 'red'];
let omakasePlayer;
let activeAlertType = null;
let commentAlertId = null;
let commentSubscription = null;
let measurementSubscription = null;
let mouseOnLegendButton = false;
let omakaseMarkerList = null;
let routerVisualization = null;
let browserIsSafari = false;
let inAndOutMarkersTrack = null;
let poiTrack = null;
let bitrateTrack = null;
let thumbnailTrackRef = null;
let commentButton = null;
let measurementButton = null;
let legendButton_20 = null;
let imageConfigActive = null;
let imageConfigInactive = null;
let buttonSub = null;

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
    domHelper.setStyle(domHelper.getById('tab-rvc'), {display: 'none'});
    domHelper.setStyle(domHelper.getById('tab-separator'), {display: 'none'});
  }

  createOmakasePlayer();
  loadOmakaseVideo(urls[urlSelector].video);
  initializeUiEvents();

  omakasePlayer.player.onEvent$.subscribe((event) => {
    if (event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED) {
      createOmakaseTimeline();
    }
    if (event.type === PlayerEventType.PLAYER_PLAY) isPlaying = true;
    if (event.type === PlayerEventType.PLAYER_PAUSE || event.type === PlayerEventType.PLAYER_ENDED) isPlaying = false;
  });

  omakasePlayer.player.audio.onEvent$.subscribe((event) => {
    if (event.type !== PlayerAudioEventType.PLAYER_AUDIO_LOADED) return;

    let userAgent = (window.navigator && window.navigator.userAgent) || '';
    let isFirefox = /Firefox/i.test(userAgent);
    let isEdge = /Edg/i.test(userAgent);
    let isChromium = /Chrome/i.test(userAgent) || /CriOS/i.test(userAgent);
    let isChrome = !isEdge && isChromium;

    if (isFirefox || isChrome) {
      if (routerVisualization) {
        routerVisualization.destroy();
        routerVisualization = null;
      }

      routerVisualization = new RouterVisualization(
        {
          size: 'medium',
          routerVisualizationHTMLElementId: 'omakase-audio-router',
          visualizationTracks: [
            {
              name: '5.1',
              inputNumber: 6,
              maxInputNumber: 6,
              inputLabels: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'],
            },
          ],
        },
        omakasePlayer
      );

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
          routerVisualization.updateSize(event.target.innerHTML.toLowerCase());
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
  domHelper.getById('addMarker').onclick = addMarker;

  initializePlayerEventListeners();
  initializeVuMeter();

  window.omakasePlayer = omakasePlayer;
});

function createOmakasePlayer() {
  omakasePlayer = new OmakasePlayer({
    playerHtmlElementId: 'omakase-player',
    chromingTheme: ChromingTheme.DEFAULT,
    chromingThemeConfig: {
      controlBarVisibility: 'FULLSCREEN_ONLY',
    },
  });
}

function loadOmakaseVideo(url, frameRate) {
  if (!url) {
    omakasePlayer.destroy();
    throw new Error('Video url is required!');
  } else {
    const loadOptions = frameRate ? {frameRate} : undefined;
    omakasePlayer.loadMainMedia(url, loadOptions).subscribe();
  }
}

function createOmakaseTimeline() {
  omakasePlayer
    .createTimeline({
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
  initializeScrubberLane();

  addZoomButtons();

  addInAndOutMarkersLane();

  addBlackMarkersLane();

  addTimelineButtons();

  addPoiMarkersLane();

  addThumbnailsLane();

  addMarkerList();

  addBitrateLineChart();

  addSidecarDKSubtitlesLane();

  addStereoAudioTrackLane();

  addSurroundAudioTrackLane();

  addScrollbarLane();

  processSubtitles();

  initializePlayerControlButtons();
}

function addInAndOutMarkersLane() {
  // Custom in/out markers lane
  let inAndOutMarkersLane = new MarkerTrackLane({
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

  inAndOutMarkersTrack = new MarkerTrack();
  omakasePlayer.track.add(inAndOutMarkersTrack);
  inAndOutMarkersLane.addTrack(inAndOutMarkersTrack, {
    style: {
      markerSymbol: 'triangle',
      markerSymbolSize: 15,
    },
  });

  inAndOutMarkersTrack.onEvent$.subscribe((event) => {
    if (event.type !== TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED || event.type !== TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED) {
      return;
    }
    if (inAndOutMarkersTrack.timedItems.length === 0) {
      inAndOutMarkersLane.minimize();
    } else {
      inAndOutMarkersLane.maximize();
    }
  });

  inAndOutMarkersLane.onEvent$.subscribe((event) => {
    if (event.type === MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_HANDLE_MOUSE_ENTER || event.type === MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_MOUSE_ENTER) {
      const markerId = event.data.item.id;
      const marker = inAndOutMarkersTrack.getTimedItem(markerId);
      if (marker && activeMarker?.id !== markerId) {
        setActiveMarker(marker);
      }
    }
  });

  // Add predefined marker
  const predefinedMarker = {
    temporal: {type: 'SPAN', start: '10.001', end: '33'},
    label: 'Predefined marker',
  };
  inAndOutMarkersTrack.addTimedItems(predefinedMarker);
  const addedMarker = inAndOutMarkersTrack.timedItems[0];
  if (addedMarker) {
    omakasePlayer.ui.updateStyleRule({
      id: addedMarker.id,
      style: {markerColor: markerColors[1], canDeleteMarker: false},
    });
    setActiveMarker(addedMarker);
  }
}

function addBlackMarkersLane() {
  // Blacks marker lane
  if (urls[urlSelector].blacks) {
    let blacksMarkersLane = new MarkerTrackLane({
      description: 'Black segments',
      style: {
        backgroundFill: '#E9F7FF',
        height: 30,
        leftBackgroundFill: '#E4E5E5',
        marginBottom: 1,
      },
    });

    omakasePlayer.timeline.addTimelineLane(blacksMarkersLane);

    omakasePlayer.track
      .load(urls[urlSelector].blacks, {
        trackType: TrackType.MARKER_TRACK,
        timedItemsLocked: true,
      })
      .subscribe((track) => {
        blacksMarkersLane.addTrack(track, {
          style: {
            markerColor: '#000000',
            markerSymbol: 'none',
            markerLineOpacity: 0,
            markerAreaOpacity: 0,
            markerHandleAreaOpacity: 0.7,
          },
        });

        blacksMarkersLane.onEvent$.subscribe((event) => {
          if (event.type === MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK) {
            const startTime = event.data.item.temporal.start !== undefined ? parseFloat(event.data.item.temporal.start) : 0;
            omakasePlayer.player.seekTo(startTime).subscribe();
          }
        });
      });
  }
}

function addPoiMarkersLane() {
  // POI marker lane
  if (urls[urlSelector].poi) {
    let poiLane = new MarkerTrackLane({
      description: 'Points of interest',
      style: {
        backgroundFill: '#E9F7FF',
        height: 30,
        leftBackgroundFill: '#E4E5E5',
        marginBottom: 1,
      },
    });

    omakasePlayer.timeline.addTimelineLane(poiLane);

    omakasePlayer.track
      .load(urls[urlSelector].poi, {
        trackType: TrackType.MARKER_TRACK,
        timedItemsLocked: true,
      })
      .subscribe((track) => {
        poiTrack = track;
        poiLane.addTrack(track, {
          style: {
            markerColor: '#CD5600',
            markerSymbol: 'circle',
          },
        });

        poiLane.onEvent$.subscribe((event) => {
          if (event.type === MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK) {
            const startTime =
              event.data.item.temporal.start !== undefined ? parseFloat(event.data.item.temporal.start) : event.data.item.temporal.time !== undefined ? parseFloat(event.data.item.temporal.time) : 0;
            omakasePlayer.player.seekTo(startTime).subscribe();
          }
        });
      });

    commentButton.onEvent$.subscribe((event) => {
      if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;
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
        commentSubscription = subscribeToComments();
      }
    });

    poiLane.addTimelineNode({
      width: 30,
      height: 30,
      justify: 'start',
      margin: [10, 10, 0, 0],
      timelineNode: commentButton,
    });
  }
}

function addThumbnailsLane() {
  // Thumbnail lane
  if (urls[urlSelector].thumbnails) {
    let defaultThumbnailLane = new ThumbnailTrackLane({
      id: 'thumbnail_lane_default',
      description: 'Thumbnails',
      style: {
        backgroundFill: '#E9F7FF',
        height: 50,
        leftBackgroundFill: '#E4E5E5',
        thumbnailHoverScale: 2,
        marginBottom: 1,
      },
    });

    omakasePlayer.timeline.addTimelineLane(defaultThumbnailLane);

    omakasePlayer.track
      .load(urls[urlSelector].thumbnails, {
        trackType: TrackType.THUMBNAIL_TRACK,
      })
      .subscribe((track) => {
        thumbnailTrackRef = track;
        defaultThumbnailLane.setTrack(track);

        defaultThumbnailLane.onEvent$.subscribe((event) => {
          if (event.type === ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_CLICK) {
            const startTime = TimedItemTemporalUtil.extractStartTime(event.data.thumbnailTrackImg.thumbnail.temporal);
            omakasePlayer.player.seekTo(startTime);
          }
        });

        if (omakaseMarkerList) {
          omakaseMarkerList.thumbnailTrack = track;
        }
      });
  }
}

function addMarkerList() {
  // Marker list
  omakaseMarkerList = new MarkerList(
    {
      markerListHTMLElementId: 'omakase-marker-list',
      headerHTMLElementId: 'marker-header',
      templateHTMLElementId: 'marker-template',
      markerTrack: [{source: TrackSource.of(inAndOutMarkersTrack.id)}],
      thumbnailTrack: thumbnailTrackRef ? {source: TrackSource.of(thumbnailTrackRef.id)} : undefined,
      styleUrl: './css/player.css',
    },
    omakasePlayer
  );

  omakaseMarkerList.onEvent$.subscribe((event) => {
    if (event.type === MarkerListEventType.MARKER_LIST_ITEM_CLICK) {
      const markerId = event.data.item.id;
      const marker = inAndOutMarkersTrack.getTimedItem(markerId);
      if (marker) {
        setActiveMarker(marker);
      }
    }
    if (event.type === MarkerListEventType.MARKER_LIST_ITEM_DELETE) {
      updateAddMarkerButton();
      const deletedId = event.data.item.id;
      if (activeMarker?.id === deletedId) {
        setActiveMarker(null);
        const nextMarkerState = omakaseMarkerList.markers[activeMarkerIndex] || omakaseMarkerList.markers[activeMarkerIndex - 1] || omakaseMarkerList.markers[0];
        if (nextMarkerState) {
          setActiveMarker(inAndOutMarkersTrack.getTimedItem(nextMarkerState.id) || null);
        }
      }
    }
  });
}

function addBitrateLineChart() {
  // Bitrate line chart
  if (urls[urlSelector].bitrate) {
    let lineChartLaneForBitrate = new LineChartLane({
      description: 'Video Bitrate (0-7500)',
      style: {
        pointWidth: 3,
        lineStrokeWidth: 2,
        backgroundFill: '#E9F7FF',
        height: 50,
        leftBackgroundFill: '#E4E5E5',
        marginBottom: 1,
      },
    });

    omakasePlayer.timeline.addTimelineLane(lineChartLaneForBitrate);

    omakasePlayer.track
      .load(urls[urlSelector].bitrate, {
        trackType: TrackType.OBSERVATION_TRACK,
      })
      .subscribe((track) => {
        bitrateTrack = track;
        lineChartLaneForBitrate.addTrack(track, {
          scale: {min: 0, max: 7500},
          interpolationStrategy: 'avg',
          interpolationWidth: 3,
          style: {
            measurements: [
              {
                lineStroke: '#000000',
                lineStrokeWidth: 2,
              },
            ],
          },
        });
      });

    lineChartLaneForBitrate.addTimelineNode({
      width: 30,
      height: 30,
      justify: 'start',
      margin: [10, 10, 0, 0],
      timelineNode: measurementButton,
    });
  }
}

function addSidecarDKSubtitlesLane() {
  // Sidecar DK subtitle lane
  let subtitlesLane2;
  if (urls[urlSelector].dkSubtitle) {
    subtitlesLane2 = new TextTrackLane({
      description: '',
      style: {
        backgroundFill: '#E9F7FF',
        height: 40,
        leftBackgroundFill: '#E4E5E5',
        textLaneItemOpacity: 0.7,
        textLaneItemFill: '#87D798',
        paddingTop: 10,
        paddingBottom: 10,
        marginBottom: 1,
      },
    });

    omakasePlayer.timeline.addTimelineLane(subtitlesLane2);

    omakasePlayer.track
      .load(urls[urlSelector].dkSubtitle, {
        trackType: TrackType.TEXT_TRACK,
        label: 'DK',
      })
      .subscribe((track) => {
        subtitlesLane2.setTrack(track);
        omakasePlayer.player.loadSidecarTrack(TrackSource.of(track.id));
      });
  }

  let subDkLabel = new TextLabel({
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

  omakasePlayer.player.text.onEvent$.subscribe((event) => {
    if (event.type !== PlayerTextEventType.PLAYER_TEXT_CHANGE) return;
    const tracks = omakasePlayer.player.text.getTracks();
    const dkTrack = tracks.find((t) => t.label === 'DK');
    const activeTrack = omakasePlayer.player.text.state.tracks['SIDECAR'].find((track) => track.active);
    subDkLabel.style = {
      backgroundFill: activeTrack?.trackId === dkTrack?.id && activeTrack?.shown ? '#008000' : '#f45844',
    };
  });

  subDkLabel.onEvent$.subscribe((event) => {
    if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;
    currentCaption = 'DK';
    const tracks = omakasePlayer.player.text.getTracks();
    const dkTrack = tracks.find((t) => t.label === 'DK');
    if (dkTrack) {
      omakasePlayer.player.text.switchTrack(dkTrack.id);
      omakasePlayer.player.text.show();
      domHelper.setStyle(buttonSub, {opacity: '1'});
    }
    let caption = domHelper.getById('caption');
    domHelper.setProperty(caption, 'innerHTML', currentCaption);
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
      timelineNode: new TextLabel({
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
}

function addStereoAudioTrackLane() {
  let stereoAudioTrackLane = createNewAudioTrackLane('', urls[urlSelector].audioLvl20);
  if (stereoAudioTrackLane) {
    omakasePlayer.timeline.addTimelineLane(stereoAudioTrackLane);
  }

  let stereoAudioTrackLaneR;
  let stereoAudioTrackLaneL;
  let stereoRmsBarChartLane;
  let lineChartLaneForMultipleMeasurements;

  if (stereoAudioTrackLane) {
    stereoAudioTrackLaneR = createNewAudioTrackLane('Right channel', urls[urlSelector].audioLvl20R);
    if (stereoAudioTrackLaneR) {
      omakasePlayer.timeline.addTimelineLane(stereoAudioTrackLaneR);
    }

    stereoAudioTrackLaneL = createNewAudioTrackLane('Left channel', urls[urlSelector].audioLvl20L);
    if (stereoAudioTrackLaneL) {
      omakasePlayer.timeline.addTimelineLane(stereoAudioTrackLaneL);
    }

    if (urls[urlSelector].rms) {
      stereoRmsBarChartLane = new BarChartLane({
        description: 'Overall RMS Level',
        style: {
          backgroundFill: '#E9F7FF',
          height: 60,
          leftBackgroundFill: '#E4E5E5',
          margin: 0,
        },
      });

      omakasePlayer.timeline.addTimelineLane(stereoRmsBarChartLane);

      omakasePlayer.track
        .load(urls[urlSelector].rms, {
          trackType: TrackType.OBSERVATION_TRACK,
        })
        .subscribe((track) => {
          stereoRmsBarChartLane.addTrack(track, {
            interpolationStrategy: 'avg',
            interpolationWidth: 8,
            scale: {min: -54, max: 0},
            scaleBaseline: -54,
            style: {
              measurements: [
                {
                  fillLinearGradientColorStops: maxSampleFillLinearGradientColorStops,
                  cornerRadius: 2,
                  paddingX: 1,
                },
              ],
            },
          });
        });
    }

    if (urls[urlSelector].multipleMeasurements) {
      lineChartLaneForMultipleMeasurements = new LineChartLane({
        description: 'R128 Loudness',
        style: {
          pointWidth: 3,
          lineStrokeWidth: 2,
          backgroundFill: '#E9F7FF',
          height: 100,
          leftBackgroundFill: '#E4E5E5',
        },
      });

      omakasePlayer.timeline.addTimelineLane(lineChartLaneForMultipleMeasurements);

      omakasePlayer.track
        .load(urls[urlSelector].multipleMeasurements, {
          trackType: TrackType.OBSERVATION_TRACK,
        })
        .subscribe((track) => {
          lineChartLaneForMultipleMeasurements.addTrack(track, {
            scale: {min: -200, max: 0},
            interpolationStrategy: 'avg',
            interpolationWidth: 3,
            style: {
              measurements: [
                {
                  measurement: 'r128.M',
                  lineStroke: 'orange',
                  lineStrokeWidth: 2,
                },
                {
                  measurement: 'r128.S',
                  lineStroke: 'green',
                  lineStrokeWidth: 2,
                },
              ],
            },
          });
        });

      lineChartLaneForMultipleMeasurements.addTimelineNode({
        width: 30,
        height: 30,
        justify: 'start',
        margin: [10, 10, 0, 2],
        timelineNode: legendButton_20,
      });
    }
  }

  if (lineChartLaneForMultipleMeasurements) {
    lineChartLaneForMultipleMeasurements.setStyle({marginBottom: 1});
  } else if (stereoRmsBarChartLane) {
    stereoRmsBarChartLane.setStyle({marginBottom: 1});
  } else if (stereoAudioTrackLaneL) {
    stereoAudioTrackLaneL.setStyle({marginBottom: 1});
  } else if (stereoAudioTrackLaneR) {
    stereoAudioTrackLaneR.setStyle({marginBottom: 1});
  } else if (stereoAudioTrackLane) {
    stereoAudioTrackLane.setStyle({marginBottom: 1});
  }

  let textLabel20 = new TextLabel({
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

  textLabel20.onEvent$.subscribe((event) => {
    if (event.type === TimelineNodeEventType.TIMELINE_NODE_CLICK) {
      setActiveAudioTrack('2.0');
    }
  });

  omakasePlayer.player.audio.onEvent$.subscribe((event) => {
    if (event.type !== PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED) return;
    textLabel20.style = {
      backgroundFill: currentAudio === '2.0' ? '#008000' : '#f45844',
    };
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
      timelineNode: new ImageButton({
        src: `https://demo.player.byomakase.org/images/volume-off.svg`,
        width: 30,
        height: 30,
        listening: false,
      }),
    });
  }

  let iconMinimize20 = new ImageButton({
    src: `https://demo.player.byomakase.org/images/chevron-down.svg`,
    width: 20,
    height: 20,
    listening: true,
  });

  iconMinimize20.onEvent$.subscribe((event) => {
    if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;

    const isMimimized = stereoAudioTrackLaneL
      ? stereoAudioTrackLaneL.isMinimized()
      : stereoAudioTrackLaneR
        ? stereoAudioTrackLaneR.isMinimized()
        : stereoRmsBarChartLane
          ? stereoRmsBarChartLane.isMinimized()
          : lineChartLaneForMultipleMeasurements
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

    stereoAudioTrackLane.setStyle({
      marginBottom: isMimimized ? 0 : 1,
    });

    let lastSubLane = lineChartLaneForMultipleMeasurements || stereoRmsBarChartLane || stereoAudioTrackLaneL || stereoAudioTrackLaneR;
    if (lastSubLane) {
      lastSubLane.setStyle({
        marginBottom: isMimimized ? 1 : 0,
      });
    }

    const imageConfig = isMimimized ? imageConfigExpanded : imageConfigCollapsed;
    iconMinimize20.setImage(imageConfig);
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
}

function addSurroundAudioTrackLane() {
  let surroundAudioTrackLane = createNewAudioTrackLane('', urls[urlSelector].audioLvl51);
  if (surroundAudioTrackLane) {
    omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLane);
    surroundAudioTrackLane.setStyle({
      marginBottom: 1,
    });
  }

  let surroundAudioTrackLaneL;
  let surroundAudioTrackLaneR;
  let surroundAudioTrackLaneC;
  let surroundAudioTrackLaneLFE;
  let surroundAudioTrackLaneSL;
  let surroundAudioTrackLaneSR;

  if (surroundAudioTrackLane) {
    surroundAudioTrackLaneL = createNewAudioTrackLane('Left channel', urls[urlSelector].audioLvl51L);
    if (surroundAudioTrackLaneL) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneL);
      surroundAudioTrackLaneL.minimize();
    }

    surroundAudioTrackLaneR = createNewAudioTrackLane('Right channel', urls[urlSelector].audioLvl51R);
    if (surroundAudioTrackLaneR) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneR);
      surroundAudioTrackLaneR.minimize();
    }

    surroundAudioTrackLaneC = createNewAudioTrackLane('Center channel', urls[urlSelector].audioLvl51C);
    if (surroundAudioTrackLaneC) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneC);
      surroundAudioTrackLaneC.minimize();
    }

    surroundAudioTrackLaneLFE = createNewAudioTrackLane('LFE channel', urls[urlSelector].audioLvl51LFE);
    if (surroundAudioTrackLaneLFE) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneLFE);
      surroundAudioTrackLaneLFE.minimize();
    }

    surroundAudioTrackLaneSL = createNewAudioTrackLane('Surround Left channel', urls[urlSelector].audioLvl51SL);
    if (surroundAudioTrackLaneSL) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneSL);
      surroundAudioTrackLaneSL.minimize();
    }

    surroundAudioTrackLaneSR = createNewAudioTrackLane('Surround Right channel', urls[urlSelector].audioLvl51SR);
    if (surroundAudioTrackLaneSR) {
      omakasePlayer.timeline.addTimelineLane(surroundAudioTrackLaneSR);
      surroundAudioTrackLaneSR.minimize();
    }
  }

  let textLabel51 = new TextLabel({
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

  omakasePlayer.player.audio.onEvent$.subscribe((event) => {
    if (event.type !== PlayerAudioEventType.PLAYER_AUDIO_TRACK_SWITCHED) return;
    textLabel51.style = {
      backgroundFill: currentAudio === '5.1' ? '#008000' : '#f45844',
    };
  });

  textLabel51.onEvent$.subscribe((event) => {
    if (event.type === TimelineNodeEventType.TIMELINE_NODE_CLICK) {
      setActiveAudioTrack('5.1');
    }
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
      timelineNode: new ImageButton({
        src: `https://demo.player.byomakase.org/images/volume-off.svg`,
        width: 30,
        height: 30,
        listening: false,
      }),
    });
  }

  let iconMinimize51 = new ImageButton({
    src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
    width: 20,
    height: 20,
    listening: true,
  });

  iconMinimize51.onEvent$.subscribe((event) => {
    if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;

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

    surroundAudioTrackLane.setStyle({
      marginBottom: isMimimized ? 0 : 1,
    });

    let lastSurroundLane = surroundAudioTrackLaneSR || surroundAudioTrackLaneSL || surroundAudioTrackLaneLFE || surroundAudioTrackLaneC || surroundAudioTrackLaneR || surroundAudioTrackLaneL;
    if (lastSurroundLane) {
      lastSurroundLane.setStyle({
        marginBottom: isMimimized ? 1 : 0,
      });
    }

    const imageConfig = isMimimized ? imageConfigExpanded : imageConfigCollapsed;
    iconMinimize51.setImage(imageConfig);
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
}

function initializeScrubberLane() {
  const scrubberLane = omakasePlayer.timeline.getScrubberLane();

  scrubberLane.setStyle({
    backgroundFill: '#EDEFEE',
    leftBackgroundFill: '#E4E5E5',
    descriptionTextFontSize: 20,
    marginBottom: 0,
  });

  scrubberLane.updateLayoutDimensions();

  omakasePlayer.timeline.addTimelineLane(
    new LabelLane({
      style: {
        height: 15,
        backgroundFill: '#E4E5E5',
        marginBottom: 1,
      },
    })
  );
}

function addTimelineButtons() {
  imageConfigActive = {
    src: `https://demo.player.byomakase.org/images/info-active.svg`,
    width: 20,
    height: 20,
    listening: true,
  };
  imageConfigInactive = {
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

  commentButton = new ImageButton(imageConfigInactive);
  measurementButton = new ImageButton(imageConfigInactive);
  legendButton_20 = new ImageButton(legendInactive);

  legendButton_20.onEvent$.subscribe((event) => {
    if (event.type === TimelineNodeEventType.TIMELINE_NODE_MOUSE_ENTER) mouseOnLegendButton = true;
    if (event.type === TimelineNodeEventType.TIMELINE_NODE_MOUSE_LEAVE) mouseOnLegendButton = false;
  });

  document.body.addEventListener('click', (event) => {
    let legendBox = domHelper.querySelector('.legend-box');
    if (legendBox && !mouseOnLegendButton && !event.target.closest('.legend-box')) {
      domHelper.toggleLegendBox(legendButton_20, false, legendInactive, legendBox);
    }
  });

  legendButton_20.onEvent$.subscribe((event) => {
    if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;
    if (domHelper.getById('legend-box-20')) {
      let legendBox = domHelper.getById('legend-box-20');
      domHelper.toggleLegendBox(legendButton_20, false, legendInactive, legendBox);
    } else {
      domHelper.toggleLegendBox(legendButton_20, true, legendActive, undefined, event);
    }
  });

  measurementButton.onEvent$.subscribe((event) => {
    if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;
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
      measurementSubscription = subscribeToMeasurements();
    }
  });
}

function addScrollbarLane() {
  let scrollbarLane = new ScrollbarLane({
    description: '',
    style: {
      height: 25,
      backgroundFill: '#EDEFFE',
      leftBackgroundFill: '#E4E5E5',
      scrollbarHandleBarFill: '#00A6F0',
      scrollbarHeight: 16,
    },
  });

  omakasePlayer.timeline.addTimelineLane(scrollbarLane);
}

function processSubtitles() {
  omakasePlayer.player.text.onEvent$.subscribe((event) => {
    if (event.type !== PlayerTextEventType.PLAYER_TEXT_TRACK_LOADED) return;

    let textTracks = omakasePlayer.player.text.getTracks();
    const track = textTracks.find((track) => track.id === event.data.playerTextTrack.trackId);

    if (track.label === 'English CC') {
      track.updateAttrs({label: 'EN'});
      omakasePlayer.player.text.switchTrack(track.id, true);

      let enClosedCaptionLane = new TextTrackLane({
        description: '',
        style: {
          backgroundFill: '#E9F7FF',
          height: 40,
          leftBackgroundFill: '#E4E5E5',
          textLaneItemOpacity: 0.7,
          textLaneItemFill: '#87D798',
          paddingTop: 10,
          paddingBottom: 10,
          marginBottom: 1,
        },
      });

      enClosedCaptionLane.setTrack(track);
      omakasePlayer.track.utils.fetchTimedItems(track.id);

      let ind = omakasePlayer.timeline.getTimelineLanes().findIndex((item) => item instanceof TextTrackLane || item instanceof BarChartLane);
      if (ind !== -1) {
        omakasePlayer.timeline.addTimelineLaneAtIndex(enClosedCaptionLane, ind);
      } else {
        ind = omakasePlayer.timeline.getTimelineLanes().length - 1;
        omakasePlayer.timeline.addTimelineLaneAtIndex(enClosedCaptionLane, ind);
      }

      let capEnLabel = new TextLabel({
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

      omakasePlayer.player.text.onEvent$.subscribe((event) => {
        if (event.type !== PlayerTextEventType.PLAYER_TEXT_CHANGE) return;
        const tracks = omakasePlayer.player.text.getTracks();
        const enTrack = tracks.find((t) => t.label === 'EN');
        const activeTrack = omakasePlayer.player.text.state.tracks['SIDECAR'].find((track) => track.active);
        capEnLabel.style = {
          backgroundFill: activeTrack?.trackId === enTrack?.id && activeTrack?.shown ? '#008000' : '#f45844',
        };
      });

      capEnLabel.onEvent$.subscribe((event) => {
        if (event.type !== TimelineNodeEventType.TIMELINE_NODE_CLICK) return;
        currentCaption = 'EN';
        const tracks = omakasePlayer.player.text.getTracks();
        const enTrack = tracks.find((t) => t.label === 'EN');
        if (enTrack) {
          omakasePlayer.player.text.switchTrack(enTrack.id);
          omakasePlayer.player.text.show();
          domHelper.setStyle(buttonSub, {opacity: '1'});
        }
        let caption = domHelper.getById('caption');
        domHelper.setProperty(caption, 'innerHTML', currentCaption);
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
        timelineNode: new TextLabel({
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
  });
}

function createNewAudioTrackLane(description, url) {
  if (url) {
    let lane = new BarChartLane({
      description: description,
      style: {
        backgroundFill: '#E9F7FF',
        height: 40,
        leftBackgroundFill: '#E4E5E5',
      },
    });

    omakasePlayer.track
      .load(url, {
        trackType: TrackType.OBSERVATION_TRACK,
      })
      .subscribe((track) => {
        lane.addTrack(track, {
          interpolationStrategy: 'max',
          interpolationWidth: 3,
          scale: {max: 1, min: -1},
          scaleBaseline: 0,
          style: {
            measurements: [
              {
                measurement: 'min',
                fillLinearGradientColorStops: minSampleFillLinearGradientColorStops,
                cornerRadius: [0, 0, 2, 2],
                paddingX: 0.5,
              },
              {
                measurement: 'max',
                fillLinearGradientColorStops: maxSampleFillLinearGradientColorStops,
                cornerRadius: [2, 2, 0, 0],
                paddingX: 0.5,
              },
            ],
          },
        });
      });

    return lane;
  }

  return null;
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
    domHelper.setStyle(RVC, {display: 'none'});
    domHelper.setStyle(MLC, {display: 'inline-block'});
    mlcTab.classList.add('active');
    rvcTab.classList.remove('active');
  };

  rvcTab.onclick = () => {
    domHelper.setStyle(MLC, {display: 'none'});
    domHelper.setStyle(RVC, {display: 'inline-block'});
    rvcTab.classList.add('active');
    mlcTab.classList.remove('active');
  };
}

function initializePlayerEventListeners() {
  omakasePlayer.player.onEvent$.subscribe((event) => {
    if (event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS) {
      const currentTime = event.data.currentTime;

      let inputFrameSeek = domHelper.getById('inputFrameSeek');
      const frameCount = omakasePlayer.player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
      domHelper.setProperty(inputFrameSeek, 'innerHTML', Math.floor(frameCount));

      let inputTimestamp = domHelper.getById('inputTimestamp');
      domHelper.setProperty(inputTimestamp, 'innerHTML', currentTime.toFixed(3));

      let inputTimestampFormatted = domHelper.getById('inputTimestampFormatted');
      const timecode = omakasePlayer.player.convertTime(currentTime, MediaTemporalFormat.SECONDS, MediaTemporalFormat.TIMECODE);
      domHelper.setProperty(inputTimestampFormatted, 'innerHTML', timecode);
    } else if (event.type === PlayerEventType.PLAYER_SEEKED) {
      let buttonReplay = domHelper.getById('buttonReplay');
      domHelper.setStyle(buttonReplay, {display: 'none'});

      if (isPlaying) {
        domHelper.setStyle(domHelper.getById('buttonPause'), {display: 'inline'});
        domHelper.setStyle(domHelper.getById('buttonPlay'), {display: 'none'});
      } else {
        domHelper.setStyle(domHelper.getById('buttonPause'), {display: 'none'});
        domHelper.setStyle(domHelper.getById('buttonPlay'), {display: 'inline'});
      }
    } else if (event.type === PlayerEventType.PLAYER_ENDED) {
      domHelper.setStyle(domHelper.getById('buttonReplay'), {display: 'inline'});
      domHelper.setStyle(domHelper.getById('buttonPause'), {display: 'none'});
      domHelper.setStyle(domHelper.getById('buttonPlay'), {display: 'none'});
    } else if (event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED) {
      console.debug('Main media loaded', event);

      omakasePlayer.player.onEvent$.subscribe((innerEvent) => {
        if (innerEvent.type === PlayerEventType.PLAYER_PLAY) {
          domHelper.setStyle(domHelper.getById('buttonReplay'), {display: 'none'});
          domHelper.setStyle(domHelper.getById('buttonPause'), {display: 'inline'});
          domHelper.setStyle(domHelper.getById('buttonPlay'), {display: 'none'});
        }

        if (innerEvent.type === 'PLAYER_PAUSE') {
          domHelper.setStyle(domHelper.getById('buttonReplay'), {display: 'none'});
          domHelper.setStyle(domHelper.getById('buttonPause'), {display: 'none'});
          domHelper.setStyle(domHelper.getById('buttonPlay'), {display: 'inline'});
        }
      });
    }
  });
}

function initializeUiEvents() {
  omakasePlayer.ui.onEvent$.subscribe((event) => {
    if (event.type === UiEventType.UI_ELEMENT_UPDATED) {
      omakasePlayer.ui.updateStyleRule({
        id: event.data.element.id,
        style: {
          highlightMarker: !!event.data.element.props?.focused,
          markerRenderType: event.data.element.props?.focused ? 'spanning-over-all-lanes' : 'default',
        },
      });
    }
  });
}

function initializePlayerControlButtons() {
  let buttonPlay = domHelper.getById('buttonPlay');
  buttonPlay.onclick = function () {
    omakasePlayer.player.play().subscribe();
  };

  let buttonPause = domHelper.getById('buttonPause');
  buttonPause.onclick = function () {
    omakasePlayer.player.pause().subscribe();
  };

  let buttonReplay = domHelper.getById('buttonReplay');
  buttonReplay.onclick = function () {
    omakasePlayer.player.seekTo(0, MediaTemporalFormat.FRAME_COUNT).subscribe();
  };

  let buttonFfBack = domHelper.getById('ff-back');
  buttonFfBack.onclick = function () {
    omakasePlayer.player.pause().subscribe({
      next: () => {
        let frame = omakasePlayer.player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
        frame = frame < 10 ? 0 : frame - 10;
        omakasePlayer.player.seekTo(frame, MediaTemporalFormat.FRAME_COUNT).subscribe();
      },
    });
  };

  let buttonBack = domHelper.getById('back');
  buttonBack.onclick = function () {
    omakasePlayer.player.pause().subscribe({
      next: () => {
        omakasePlayer.player.seekFromCurrentTime(-1, MediaTemporalFormat.FRAME_COUNT).subscribe();
      },
    });
  };

  let buttonFfForward = domHelper.getById('ff-forward');
  buttonFfForward.onclick = function () {
    omakasePlayer.player.pause().subscribe({
      next: () => {
        let frame = omakasePlayer.player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
        let totalFrames = omakasePlayer.player.getDuration(MediaTemporalFormat.FRAME_COUNT);
        frame = frame + 10 >= totalFrames ? totalFrames : frame + 10;
        omakasePlayer.player.seekTo(frame, MediaTemporalFormat.FRAME_COUNT).subscribe();
      },
    });
  };

  let buttonForward = domHelper.getById('forward');
  buttonForward.onclick = function () {
    omakasePlayer.player.pause().subscribe({
      next: () => {
        let frame = omakasePlayer.player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
        let totalFrames = omakasePlayer.player.getDuration(MediaTemporalFormat.FRAME_COUNT);
        frame = frame + 1 >= totalFrames ? totalFrames : frame + 1;
        omakasePlayer.player.seekTo(frame, MediaTemporalFormat.FRAME_COUNT).subscribe();
      },
    });
  };

  let buttonPlayback = domHelper.getById('playback');
  buttonPlayback.onclick = function () {
    togglePlayback();
  };

  let buttonMute = domHelper.getById('mute');
  let muted = false;
  buttonMute.onclick = function () {
    if (muted) {
      domHelper.setStyle(buttonMute, {opacity: '1'});
      omakasePlayer.player.audio.unmute().subscribe();
      muted = false;
    } else {
      domHelper.setStyle(buttonMute, {opacity: '0.5'});
      omakasePlayer.player.audio.mute().subscribe();
      muted = true;
    }
  };

  let buttonAudio = domHelper.getById('audio');
  buttonAudio.onclick = function () {
    toggleAudio();
  };

  buttonSub = domHelper.getById('sub');
  buttonSub.onclick = function () {
    if (!omakasePlayer.player.text.shown) {
      omakasePlayer.player.text.show().subscribe();
      domHelper.setStyle(buttonSub, {opacity: '1'});
    } else {
      omakasePlayer.player.text.hide().subscribe();
      domHelper.setStyle(buttonSub, {opacity: '0.5'});
    }
  };

  let buttonCaption = domHelper.getById('caption');
  buttonCaption.onclick = function () {
    toggleCaptions();
    domHelper.setProperty(buttonCaption, 'innerHTML', currentCaption);
    domHelper.setStyle(buttonSub, {opacity: '1'});
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

  let videoElement = omakasePlayer.player.htmlMediaElement;

  videoElement.addEventListener('enterpictureinpicture', (event) => {
    if (event instanceof PictureInPictureEvent) {
      togglePIP(true);
      let op = omakasePlayer.chroming.getPlayerChromingElement('.omakase-video-controls');
      if (op) {
        domHelper.setProperty(op, 'className', 'omakase-video-controls d-none');
      }
    } else {
      alert('Picture in Picture mode failed');
    }
  });

  videoElement.addEventListener('leavepictureinpicture', (event) => {
    if (event instanceof PictureInPictureEvent) {
      togglePIP(false);
      let op = omakasePlayer.chroming.getPlayerChromingElement('.omakase-video-controls');
      if (op) {
        domHelper.setProperty(op, 'className', 'omakase-video-controls');
      }
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
    domHelper.setStyle(detachPIP, {display: 'none'});
    let attachPIP = domHelper.getById('attach-pip');
    domHelper.setStyle(attachPIP, {display: 'none'});
  }

  let buttonFullscreen = domHelper.getById('full-screen');
  buttonFullscreen.onclick = function () {
    omakasePlayer.player.toggleFullScreen().subscribe();
  };
}

function togglePIP(isActive) {
  let detachPIP = domHelper.getById('detach-pip');
  let attachPIP = domHelper.getById('attach-pip');

  domHelper.setStyle(detachPIP, {display: isActive ? 'none' : 'inline'});
  domHelper.setStyle(attachPIP, {display: isActive ? 'inline' : 'none'});
}

function uninitializeVuMeter() {
  let peakMeter = domHelper.getById('peak-meter');
  domHelper.setProperty(peakMeter, 'innerHTML', '');
  vuMeterInstance.destroy();
  vuMeterInstance = void 0;
}

let vuMeterInstance = null;

function initializeVuMeter() {
  if (!vuMeterInstance) {
    let omakaseVideo = domHelper.getByClassName('omakase-video')[0];
    if (omakaseVideo) {
      domHelper.setProperty(omakaseVideo, 'volume', 1);
    }

    vuMeterInstance = new VuMeter({
      player: omakasePlayer,
      audioType: PlayerAudioType.MAIN,
      config: {
        htmlElementId: 'peak-meter',
        channels: 6,
        rangeMinDb: -59,
        scaleStepDb: 6,
        orientation: VuMeterOrientation.VERTICAL,
      },
    });
  }
}

function keyListener(event) {
  if (event.code === 'KeyP') {
    omakasePlayer.player.play().subscribe();
  } else if (event.code === 'KeyK' && event.metaKey) {
    omakasePlayer.player.pause().subscribe();
  } else if (event.code === 'ArrowRight') {
    seekNextFrame();
  } else if (event.code === 'ArrowLeft') {
    seekPreviousFrame();
  } else if (event.code === 'ArrowUp' && event.shiftKey && !event.metaKey) {
    navigateForwardsInSeconds(1);
  } else if (event.code === 'ArrowDown' && event.shiftKey && !event.metaKey) {
    navigateBackwardsInSeconds(1);
  } else if (event.code === 'ArrowUp' && event.metaKey && !event.shiftKey) {
    event.preventDefault();
    navigateForwardsInSeconds(10);
  } else if (event.code === 'ArrowDown' && event.metaKey && !event.shiftKey) {
    event.preventDefault();
    navigateBackwardsInSeconds(10);
  } else if (event.code === 'KeyF') {
    omakasePlayer.player.toggleFullScreen().subscribe();
  } else if (event.code === 'KeyI' && !event.shiftKey) {
    setInMarkerToPlayhead();
  } else if (event.code === 'KeyO' && !event.shiftKey) {
    setOutMarkertoPlayhead();
  } else if (event.code === 'KeyI' && event.shiftKey) {
    setPlayheadToInMarker();
  } else if (event.code === 'KeyO' && event.shiftKey) {
    setPlayheadToOutMarker();
  } else if (event.code === 'Digit1' && !event.ctrlKey && event.shiftKey) {
    console.debug(event.target);
    addMarker();
  } else if (event.code === 'Digit2' && !event.ctrlKey && event.shiftKey) {
    toggleNextMarker();
  } else if (event.code === 'Digit2' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(0.25);
  } else if (event.code === 'Digit3' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(0.5);
  } else if (event.code === 'Digit4' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(0.75);
  } else if (event.code === 'Digit5' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(1);
  } else if (event.code === 'Digit6' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(2);
  } else if (event.code === 'Digit7' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(4);
  } else if (event.code === 'Digit8' && event.ctrlKey && event.shiftKey) {
    setPlaybackRate(8);
  }
}

function seekPreviousFrame() {
  omakasePlayer.player.pause().subscribe({
    next: () => {
      omakasePlayer.player.seekFromCurrentTime(-1, MediaTemporalFormat.FRAME_COUNT).subscribe();
    },
  });
}

function seekNextFrame() {
  omakasePlayer.player.pause().subscribe({
    next: () => {
      let frame = omakasePlayer.player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT);
      let totalFrames = omakasePlayer.player.getDuration(MediaTemporalFormat.FRAME_COUNT);
      frame = frame + 1 >= totalFrames ? totalFrames : frame + 1;
      omakasePlayer.player.seekTo(frame, MediaTemporalFormat.FRAME_COUNT).subscribe();
    },
  });
}

function navigateBackwardsInSeconds(numOfSecs) {
  omakasePlayer.player.pause().subscribe({
    next: () => {
      omakasePlayer.player.seekFromCurrentTime(-numOfSecs, MediaTemporalFormat.SECONDS).subscribe();
    },
  });
}

function navigateForwardsInSeconds(numOfSecs) {
  omakasePlayer.player.pause().subscribe({
    next: () => {
      omakasePlayer.player.seekFromCurrentTime(numOfSecs, MediaTemporalFormat.SECONDS).subscribe();
    },
  });
}

function setInMarkerToPlayhead() {
  if (!activeMarker || !omakaseMarkerList) return;

  console.debug('set IN Marker to Playhead', activeMarker.id);

  const playhead = omakasePlayer.player.getCurrentTime();
  const temporal = activeMarker.temporal;
  if (temporal.type === 'SPAN' || temporal.type === 'SPAN_START') {
    const endTime = temporal.end !== undefined ? parseFloat(temporal.end) : Infinity;
    if (playhead <= endTime) {
      inAndOutMarkersTrack.updateTimedItem(activeMarker.id, {
        temporal: {type: temporal.type, start: String(playhead), end: temporal.end},
      });
      setActiveMarker(inAndOutMarkersTrack?.getTimedItem(activeMarker.id) || activeMarker);
    }
  }
}

function setOutMarkertoPlayhead() {
  if (!activeMarker || !omakaseMarkerList) return;

  console.debug('set OUT Marker to Playhead', activeMarker.id);

  const playhead = omakasePlayer.player.getCurrentTime();
  const temporal = activeMarker.temporal;
  if (temporal.type === 'SPAN' || temporal.type === 'SPAN_END') {
    const startTime = temporal.start !== undefined ? parseFloat(temporal.start) : 0;
    if (startTime <= playhead) {
      inAndOutMarkersTrack.updateTimedItem(activeMarker.id, {
        temporal: {type: temporal.type, start: temporal.start, end: String(playhead)},
      });
      setActiveMarker(inAndOutMarkersTrack?.getTimedItem(activeMarker.id) || activeMarker);
    }
  }
}

function setPlayheadToInMarker() {
  if (!activeMarker) return;

  console.debug('set Playhead to IN Marker', activeMarker.id);
  const temporal = activeMarker.temporal;
  const startTime = temporal.start !== undefined ? parseFloat(temporal.start) : temporal.time !== undefined ? parseFloat(temporal.time) : 0;
  omakasePlayer.player.seekTo(startTime).subscribe();
}

function setPlayheadToOutMarker() {
  if (!activeMarker) return;

  console.debug('set Playhead to OUT Marker', activeMarker.id);
  const temporal = activeMarker.temporal;
  const endTime = temporal.end !== undefined ? parseFloat(temporal.end) : 0;
  omakasePlayer.player.seekTo(endTime).subscribe();
}

function addMarker() {
  if (!inAndOutMarkersTrack) return;

  console.debug('Adding marker at frame', omakasePlayer.player.getCurrentTime(MediaTemporalFormat.FRAME_COUNT));

  if (inAndOutMarkersTrack.timedItems.length >= maxMarkerCount) {
    return;
  }

  const currentTime = omakasePlayer.player.getCurrentTime();
  const color = markerColors[markerCount % markerColors.length];
  const idsBefore = new Set(inAndOutMarkersTrack.timedItems.map((m) => m.id));

  inAndOutMarkersTrack.addTimedItems({
    temporal: {type: 'SPAN', start: String(currentTime), end: String(currentTime + 20)},
    label: 'Marker ' + markerCount,
  });

  const newMarker = inAndOutMarkersTrack.timedItems.find((m) => !idsBefore.has(m.id));
  if (newMarker) {
    omakasePlayer.ui.updateStyleRule({
      id: newMarker.id,
      style: {markerColor: color},
    });
    setActiveMarker(newMarker);
  }

  markerCount++;
  updateAddMarkerButton();
}

function setActiveMarker(marker) {
  if (activeMarker) {
    if (marker && activeMarker.id === marker.id) return;
    omakasePlayer.ui.updateElement({id: activeMarker.id, props: {focused: false}});
  }
  if (marker) {
    activeMarker = marker;
    activeMarkerIndex = omakaseMarkerList?.markers.findIndex((m) => m.id === marker.id) ?? 0;
    omakasePlayer.ui.updateElement({id: marker.id, props: {focused: true}});
  } else {
    activeMarker = null;
    activeMarkerIndex = -1;
  }
}

function toggleNextMarker() {
  if (!inAndOutMarkersTrack) return;
  const markers = inAndOutMarkersTrack.timedItemsSorted;
  if (!markers.length) return;
  const currentId = activeMarker?.id;
  const currentIndex = currentId ? markers.findIndex((m) => m.id === currentId) : -1;
  const nextMarker = markers[(currentIndex + 1) % markers.length];
  if (nextMarker) {
    setActiveMarker(nextMarker);
  }
}

function updateAddMarkerButton() {
  const addMarkerButton = domHelper.getById('addMarker');
  const currentCount = inAndOutMarkersTrack?.timedItems.length ?? 0;
  domHelper.setStyle(addMarkerButton, {
    display: currentCount >= maxMarkerCount ? 'none' : '',
  });
}

function setPlaybackRate(speed) {
  omakasePlayer.player.setPlaybackRate(speed).subscribe();
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
  let textTracks = omakasePlayer.player.text.getTracks();
  if (activeCaptionIndex === captions.length - 1) {
    currentCaption = captions[0];
  } else {
    currentCaption = captions[activeCaptionIndex + 1];
  }
  const currentTextTrack = textTracks.find((track) => track.label === currentCaption);
  if (currentTextTrack) {
    omakasePlayer.player.text.switchTrack(currentTextTrack.id, true);
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
  const tracks = omakasePlayer.player.audio.getTracks();
  if ('5.1' === audio) {
    const trackId = tracks[0]?.id;
    if (trackId) {
      omakasePlayer.player.audio.switchTrack(trackId).subscribe(() => {
        if (routerVisualization) {
          routerVisualization.destroy();
          routerVisualization = null;
        }
        routerVisualization = new RouterVisualization(
          {
            size: 'medium',
            routerVisualizationHTMLElementId: 'omakase-audio-router',
            visualizationTracks: [
              {
                name: '5.1',
                maxInputNumber: 6,
                inputLabels: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'],
              },
            ],
          },
          omakasePlayer
        );
      });
    }
  } else {
    const trackId = tracks[1]?.id;
    if (trackId) {
      omakasePlayer.player.audio.switchTrack(trackId).subscribe(() => {
        if (routerVisualization) {
          routerVisualization.destroy();
          routerVisualization = null;
        }
        routerVisualization = new RouterVisualization(
          {
            size: 'medium',
            routerVisualizationHTMLElementId: 'omakase-audio-router',
            visualizationTracks: [
              {
                name: '2.0',
                maxInputNumber: 2,
                inputLabels: ['L', 'R'],
              },
            ],
          },
          omakasePlayer
        );
      });
    }
  }
  currentAudio = audio;
  let _audio = domHelper.getById('audio');
  domHelper.setProperty(_audio, 'innerHTML', currentAudio);
}

function enableSafeZone(safeZone) {
  let safeZoneOn = domHelper.getById('safe-zone-on');
  let safeZoneoOff = domHelper.getById('safe-zone-off');

  if (safeZone) {
    omakasePlayer.chroming.removeAllSafeZones();
    domHelper.setStyle(safeZoneOn, {display: 'none'});
    domHelper.setStyle(safeZoneoOff, {display: 'inline'});
  } else {
    omakasePlayer.chroming.addSafeZone({
      topRightBottomLeftPercent: [10, 10, 10, 10],
    });
    omakasePlayer.chroming.addSafeZone({
      topRightBottomLeftPercent: [20, 20, 20, 20],
    });
    domHelper.setStyle(safeZoneOn, {display: 'inline'});
    domHelper.setStyle(safeZoneoOff, {display: 'none'});
  }
}

function addZoomButtons() {
  let scrubberLane = omakasePlayer.timeline.getScrubberLane();

  let zoomInButton = new ImageButton({
    src: `https://demo.player.byomakase.org/images/plus-circle.svg`,
    width: 20,
    height: 20,
    listening: true,
  });

  zoomInButton.onEvent$.subscribe((event) => {
    if (event.type === TimelineNodeEventType.TIMELINE_NODE_CLICK) {
      omakasePlayer.timeline.zoomInEased().subscribe();
    }
  });

  let zoomOutButton = new ImageButton({
    src: `https://demo.player.byomakase.org/images/minus-circle.svg`,
    width: 20,
    height: 20,
    listening: true,
  });

  zoomOutButton.onEvent$.subscribe((event) => {
    if (event.type === TimelineNodeEventType.TIMELINE_NODE_CLICK) {
      omakasePlayer.timeline.zoomOutEased().subscribe();
    }
  });

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

function subscribeToComments() {
  const timeProvider$ = omakasePlayer.player.onEvent$.lift({
    call(subscriber, source) {
      return source.subscribe({
        next(event) {
          if (event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS && !subscriber.closed) {
            subscriber.next(event.data.currentTime);
          }
        },
        error(err) {
          subscriber.error(err);
        },
        complete() {
          subscriber.complete();
        },
      });
    },
  });

  const emitter = new TimedItemsTrackEventEmitter(poiTrack, timeProvider$, 0.5);

  // show the first comment
  const nearestItem = poiTrack.findNearestTimedItem(omakasePlayer.player.getCurrentTime());
  if (nearestItem) {
    const text = (nearestItem.data?.text || nearestItem.label || '').replace(':COMMENT=', '');
    if (commentAlertId) {
      omakasePlayer.alerts.dismiss(commentAlertId);
    }
    commentAlertId = omakasePlayer.alerts.info(text);
  }

  const sub = emitter.onEvent$.subscribe((event) => {
    if (event.type === TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY) {
      const item = event.data.exactItems[0] ?? event.data.nearItems[0];
      if (item) {
        const text = (item.data?.text || item.label || '').replace(':COMMENT=', '');
        if (commentAlertId) {
          omakasePlayer.alerts.dismiss(commentAlertId);
        }
        commentAlertId = omakasePlayer.alerts.info(text);
      }
    }
  });

  return {
    unsubscribe() {
      sub.unsubscribe();
      emitter.destroy();
    },
  };
}

function subscribeToMeasurements() {
  const timeProvider$ = omakasePlayer.player.onEvent$.lift({
    call(subscriber, source) {
      return source.subscribe({
        next(event) {
          if (event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS && !subscriber.closed) {
            subscriber.next(event.data.currentTime);
          }
        },
        error(err) {
          subscriber.error(err);
        },
        complete() {
          subscriber.complete();
        },
      });
    },
  });

  const emitter = new TimedItemsTrackEventEmitter(bitrateTrack, timeProvider$);
  const sub = emitter.onEvent$.subscribe((event) => {
    if (event.type === TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY) {
      const item = event.data.exactItems[0];
      if (item) {
        const valueItem = item.items?.find((i) => i.measurement === 'value') || item.items?.[0];
        const value = valueItem?.value;
        if (value !== undefined) {
          omakasePlayer.alerts.warn(`Bitrate: ${value}`, {duration: 2500});
        }
      }
    }
  });

  return {
    unsubscribe() {
      sub.unsubscribe();
      emitter.destroy();
    },
  };
}

function reloadVideoAndTimeline(url) {
  let buttonReplay = domHelper.getById('buttonReplay');
  domHelper.setStyle(buttonReplay, {display: 'none'});

  let buttonPause = domHelper.getById('buttonPause');
  domHelper.setStyle(buttonPause, {display: 'none'});

  let buttonPlay = domHelper.getById('buttonPlay');
  domHelper.setStyle(buttonPlay, {display: 'inline'});

  if (markerCount > maxMarkerCount) {
    let _addMarker = domHelper.create('span');
    domHelper.setProperty(_addMarker, 'id', 'addMarker');
    domHelper.setStyle(_addMarker, {cursor: 'pointer'});

    let img = domHelper.create('img');
    domHelper.setProperty(img, 'src', 'images/add.svg');
    domHelper.setStyle(img, {height: '12px', paddingLeft: '15px'});
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

  if (omakaseMarkerList) {
    omakaseMarkerList.destroy();
    omakaseMarkerList = null;
  }

  loadOmakaseVideo(url, urls[urlSelector].frameRate);
}

function resetVariables() {
  activeMarker = null;
  activeMarkerIndex = -1;
  currentSpeed = 1;
  currentAudio = '5.1';
  currentCaption = 'EN';
  speeds = [0.25, 0.5, 0.75, 1, 2, 4, 8];
  captions = ['EN', 'DK'];
  audios = ['5.1', '2.0'];
  markerCount = 2;
  splitLaneId = 0;
  markerColors = ['#E4ABFF', '#6AC7F6', '#A007E8', '#FCD004', '#009CEB', '#5E1879', '#4D79A7', '#A481B5', '#5A6C80', '#2B299E', '#EE9247', '#520160', '#863800', '#CD5600'];
  activeAlertType = null;
  commentAlertId = null;
  commentSubscription = null;
  measurementSubscription = null;
  inAndOutMarkersTrack = null;
  poiTrack = null;
  bitrateTrack = null;
  thumbnailTrackRef = null;
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
        left: event.data.mouseEvent.clientX + 'px',
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
