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
let currentSpeed = 1;
let currentAudio = '5.1';
let currentCaption = 'EN';
let speeds = [0.25, 0.5, 0.75, 1, 2, 4, 8];
let captions = ['EN', 'DK'];
let audios = ['5.1', '2.0'];
let audioContext = null;
let markerId = 2;
let splitLaneId = 0;
let urlSelector = 0;
let markerColors = ['#E4ABFF', '#6AC7F6', '#A007E8', '#FCD004', '#009CEB', '#5E1879', '#4D79A7', '#A481B5', '#5A6C80', '#2B299E', '#EE9247', '#520160', '#863800', '#CD5600'];
let omakasePlayer;
let activeAlertType = null;
let commentAlertId = null;
let commentSubscription = null;
let measurementSubscription = null;

let urls = [
    {
        video: 'https://demo.player.byomakase.org/data/sdr-ts/meridian_sdr.m3u8',
        thumbnails: 'https://demo.player.byomakase.org/data/thumbnails/timeline.vtt',
        bitrate: 'https://demo.player.byomakase.org/data/analysis/bitrate_2-SEC.vtt',
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
        audioLvl51SL: 'https://demo.player.byomakase.org/data/waveforms/meridian_english_aud51t1c1-6-1-SEC-5_1-LS.vtt'
    }];


detectBrowser();

window.addEventListener('load', () => {

    omakasePlayer = new omakase.OmakasePlayer({
        videoHTMLElementId: 'omakase-video',
        style: {
            fontFamily: 'Arial'
        }
    });


    // Load video
    omakasePlayer.loadVideo(urls[urlSelector].video, 30).subscribe(() => {
        omakasePlayer.createTimeline({
            thumbnailVttUrl: urls[urlSelector].thumbnails,
            style:
                {
                    stageMinWidth: 700,
                    backgroundFill: '#E4E5E5',
                    headerBackgroundFill: '#EDEFEE',
                    footerBackgroundFill: '#EDEFEE',
    
                    playProgressBarHeight: 12,
                    scrollbarHeight: 0,
                    footerHeight: 0,
    
                    thumbnailHoverWidth: 200,
                    thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
                    thumbnailHoverStrokeWidth: 5,
                    thumbnailHoverYOffset: 0,
    
                    headerHeight: 20,
                    leftPanelWidth: 350,
                    rightPanelLeftGutterWidth: 30,
                    rightPanelRightGutterWidth: 30,
                    timecodedContainerClipPadding: 20,
    
                    playheadVisible: true,
                    playheadFill: '#000',
                    playheadLineWidth: 2,
                    playheadSymbolHeight: 10,
                    playheadScrubberHeight: 10,
    
                    playheadBackgroundFill: '#ffffff',
                    playheadBackgroundOpacity: 0,
    
                    playheadPlayProgressFill: '#008cbc',
                    playheadPlayProgressOpacity: 0.5,
    
                    playheadBufferedFill: '#a2a2a2',
                    playheadBufferedOpacity: 1,
    
                    stageMinHeight: 300,
                    playheadHoverTextYOffset: -25,
                    playheadHoverTextFill: '#000000'
                }
        }).subscribe(timeline => {
    
            timeline.getScrubberLane().style = {
                backgroundFill: '#EDEFEE',
                leftBackgroundFill: '#E4E5E5',
                descriptionTextFontSize: 20
            }
    
            addZoomButtons();
    
            addSplitLine();
            //Creating Marker Lane
            let inAndOutMarkersLane = new omakase.MarkerLane({
                id: "marker_lane_inout_1", description: "Custom markers",
                style: {
                    backgroundFill: '#E9F7FF',
                    height: 30,
                    leftBackgroundFill: '#E4E5E5',
                }
            });
    
            timeline.addTimelineLane(inAndOutMarkersLane);
    
            inAndOutMarkersLane.onMarkerFocus$.subscribe((event) => {
                console.debug("event id" + event.marker.id)
                let markerLane = omakasePlayer.timeline.getTimelineLane('marker_lane_inout_1');
                let marker = document.getElementById("marker" + event.marker.id.substring(12));
                if (event.marker.id.substring(12) != markerLane.getMarkers().indexOf(activeMarker) + 1) {
                    toggleMarkers(marker);
                }
            })
    
            //Adding sample Range marker to Marker Lane
            let periodMarker1 = inAndOutMarkersLane.addMarker(new omakase.PeriodMarker({
                id: "periodMarker1",
                timeObservation: {
                    start: 10.001,
                    end: 33
                },
                style: {
                    symbolType: 'triangle',
                    color: markerColors[1],
                    renderType: 'spanning'
                },
                editable: true
            }));
    
            toggleMarkers();
    
            periodMarker1.onChange$.subscribe((event) => {
                document.getElementById('markerStart').innerHTML = omakasePlayer.video.formatToTimecode(event.timeObservation.start);
                document.getElementById('markerEnd').innerHTML = omakasePlayer.video.formatToTimecode(event.timeObservation.end);
                let markerImage = document.getElementById('predefined-image');
                markerImage.src = markerImage.src = omakasePlayer.timeline.getTimelineLane('thumbnail_lane_default').vttFile.findCues(event.timeObservation.start, event.timeObservation.start + 20)[0].url;
            });
    
            //Decorator (blue line)
            addSplitLine();
    
            //Blacks Marker Lane
            let blacksMarkersLane = new omakase.MarkerLane({
                id: "marker_lane_blacks", description: "Black segments",
                vttUrl: urls[urlSelector].blacks,
                style: {
                    backgroundFill: '#E9F7FF',
                    height: 30,
                    leftBackgroundFill: '#E4E5E5',
                },
                markerCreateFn: (cue, index) => {
                    return new omakase.PeriodMarker({
                        timeObservation: {
                            start: cue.startTime,
                            end: cue.endTime
                        },
                        text: `${cue.text}`,
                        editable: false,
                        style: {
                            renderType: 'lane',
                            color: '#000000',
                            symbolType: 'none',
                            selectedAreaOpacity: 0,
                            lineOpacity: 0,
                        }
                    })
                },
                markerProcessFn: (marker, index) => {
                    marker.onClick$.subscribe({
                        next: (event) => {
                            console.log(`Clicked on marker with text: `, marker.text)
                            omakasePlayer.video.seekToTime(marker.timeObservation.start).subscribe(() => {
                            });
                        }
                    })
                }
    
            });
    
            timeline.addTimelineLane(blacksMarkersLane);
    
            addSplitLine();
    
            //POI Marker lane
            let poiLane = new omakase.MarkerLane({
                id: "marker_lane_poi", description: "Points of interest",
                vttUrl: urls[urlSelector].poi,
                style: {
                    backgroundFill: '#E9F7FF',
                    height: 30,
                    leftBackgroundFill: '#E4E5E5',
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
                            symbolType: 'circle'
                        }
                    })
                },
                markerProcessFn: (marker, index) => {
                    marker.onClick$.subscribe({
                        next: (event) => {
                            console.log(`Clicked on marker with text: `, marker.text)
                            omakasePlayer.video.seekToTime(marker.timeObservation.time).subscribe(() => {
                            });
                        }
                    })
                }
    
            });

            const imageConfigActive = {
                src: `https://demo.player.byomakase.org/images/info-active.svg`,
                width: 20,
                height: 20,
                listening: true
            }
            const imageConfigInactive = {
                src: `https://demo.player.byomakase.org/images/info-inactive.svg`,
                width: 20,
                height: 20,
                listening: true
            }

            const commentButton = new omakase.ImageButton(imageConfigInactive);
            const measurementButton = new omakase.ImageButton(imageConfigInactive);

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
                        commentButton.setImage(imageConfigInactive).subscribe();
                    } else {
                        if (activeAlertType === 'vttMeasurements') {
                            measurementButton.setImage(imageConfigInactive).subscribe();
                            if (measurementSubscription) {
                                measurementSubscription.unsubscribe();
                                measurementSubscription = null;
                            }
                        }
                        activeAlertType = 'vttComments';
                        commentButton.setImage(imageConfigActive).subscribe();
                        commentSubscription = subscribeToComments(poiLane);
                    }
                }
            });

            measurementButton.onClick$.subscribe({
                next: () => {
                    if (activeAlertType === 'vttMeasurements') {
                        activeAlertType = null;
                        measurementButton.setImage(imageConfigInactive).subscribe();
                        if (measurementSubscription) {
                            measurementSubscription.unsubscribe();
                            measurementSubscription = null;
                        }
                    } else {
                        if (activeAlertType === 'vttComments') {
                            commentButton.setImage(imageConfigInactive).subscribe();
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
                        measurementButton.setImage(imageConfigActive).subscribe();
                        measurementSubscription = subscribeToMeasurements(lineChartLaneForBitrate);
                    }
                }
            });

            poiLane.addTimelineNode({
                width: 30,
                height: 30,
                justify: 'start',
                margin: [10, 10, 0, 0],
                timelineNode: commentButton
            });
    
            timeline.addTimelineLane(poiLane);
    
            addSplitLine();
    
            //Adding Thumbnail Lane to timeline
            let defaultThumbnailLane = new omakase.ThumbnailLane({
                id: "thumbnail_lane_default",
                description: "Thumbnails",
                vttUrl: urls[urlSelector].thumbnails,
                style: {
                    backgroundFill: '#E9F7FF',
                    height: 50,
                    leftBackgroundFill: '#E4E5E5',
                    thumbnailHoverScale: 2
                }
            });
    
            //automatic position to thumb start frame
            defaultThumbnailLane.onClick$.subscribe((event) => {
                omakasePlayer.video.seekToTime(event.thumbnail.cue.startTime).subscribe(() => {
                });
            });
    
            timeline.addTimelineLane(defaultThumbnailLane);
    
            addSplitLine();
    
    
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
                    backgroundFill: "#E9F7FF",
                    height: 50,
                    leftBackgroundFill: '#E4E5E5'
                },
            });

            lineChartLaneForBitrate.addTimelineNode({
                width: 30,
                height: 30,
                justify: 'start',
                margin: [10, 10, 0, 0],
                timelineNode: measurementButton
            });

            omakasePlayer.timeline.addTimelineLane(lineChartLaneForBitrate);
    
            //Decorator
            addSplitLine();
    
            let subtitlesVttTracks = omakasePlayer.subtitles.getTracks();
    
            let subtitlesLane2 = new omakase.SubtitlesLane({
                id: "subtitles_lane_2",
                description: "",
                vttUrl: urls[urlSelector].dkSubtitle,
                style: {
                    backgroundFill: "#E9F7FF",
                    height: 40,
                    leftBackgroundFill: '#E4E5E5',
                    subtitlesLaneItemOpacity: 0.7,
                    subtitlesLaneItemFill: '#87D798',
                    paddingTop: 10,
                    paddingBottom: 10
                }
            });
    
            timeline.addTimelineLane(subtitlesLane2);
    
            let subDkLabel = new omakase.TextLabel({
                text: `DK`,
                listening: true,
                style: {
                    align: 'center',
                    verticalAlign: 'middle',
                    fill: '#ffffff',
                    backgroundFill: '#f45844',
                    backgroundBorderRadius: 3
                }
            });
    
            omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_SUBTITLES_SHOW, (event) => {
                let style = subDkLabel.style
                if ('da-dk' !== omakasePlayer.subtitles.getCurrentTrack().language) {
                    style.backgroundFill = '#f45844'
                } else {
                    style.backgroundFill = '#008000'
                }
                subDkLabel.style = style
            });
    
            subDkLabel.onClick$.subscribe({
                next: (event) => {
                    currentCaption = 'DK'
                    omakasePlayer.subtitles.showTrack(omakasePlayer.subtitles.getTracks()[1].id);
                    document.getElementById('caption').innerHTML = currentCaption;
                }
            })
    
            subtitlesLane2.addTimelineNode({
                width: 30,
                height: 22,
                justify: 'end',
                margin: [0, 5, 0, 0],
                timelineNode: subDkLabel
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
                        fontSize: 15
                    }
                })
            });
    
            addSplitLine();
    
            let stereoAudioTrackLane = createNewAudioTrackLane('20_audio_track_lane', '', urls[urlSelector].audioLvl20);
            timeline.addTimelineLane(stereoAudioTrackLane);
    
    
            let stereoAudioTrackLaneR = createNewAudioTrackLane('20_audio_track_lane_R', 'Right channel', urls[urlSelector].audioLvl20R);
            timeline.addTimelineLane(stereoAudioTrackLaneR);
    
            let stereoAudioTrackLaneL = createNewAudioTrackLane('20_audio_track_lane_L', 'Left channel', urls[urlSelector].audioLvl20L);
            timeline.addTimelineLane(stereoAudioTrackLaneL);
    
            let stereoRmsBarChartLane = new omakase.BarChartLane({
                vttUrl: urls[urlSelector].rms,
                description: 'Overall RMS Level',
                valueMax: 54,  // optional custom max value, if not provided it will be resolved from data
                valueMin: 0,   // optional custom min value, if not provided it will be resolved from data
                style: {
                    interpolationWidth: 8,
                    backgroundFill: "#E9F7FF",
                    height: 60,
                    leftBackgroundFill: '#E4E5E5',
                    margin: 0
                },
                valueTransformFn: (value) => {
                    // each value can be transformed in this hook function
                    return value + 54 > 0 ? value + 54 : 0;
                },
                itemProcessFn: (item, index) => {
                    // each chart item can be processed in this hook function
                    item.onClick$.subscribe({
                        next: (event) => {
                            console.log(event, item)
                        }
                    })
                },
                valueInterpolationStrategy: 'max' // average - take interpolated points average | max - take interpolated points max
            });
            omakasePlayer.timeline.addTimelineLane(stereoRmsBarChartLane);
    
            let stereoOveralRmsOgChartLane = new omakase.OgChartLane({
                vttUrl: urls[urlSelector].ebur128,
                description: 'R128 Momentary Loudness',
                valueMax: 54,  // optional custom max value, if not provided it will be resolved from data
                valueMin: 0,   // optional custom min value, if not provided it will be resolved from data
                style: {
                    interpolationWidth: 6,
                    itemScaleRatio: 0.8,
                    backgroundFill: "#E9F7FF",
                    height: 60,
                    leftBackgroundFill: '#E4E5E5'
                },
                valueTransformFn: (value) => {
                    // each value can be transformed in this hook function
                    return value + 54 > 0 ? value + 54 : 0;
                },
                itemProcessFn: (item, index) => {
                    // each chart item can be processed in this hook function
                    item.onClick$.subscribe({
                        next: (event) => {
                            console.log(event, item)
                        }
                    })
                },
                valueInterpolationStrategy: 'max' // average - take interpolated points average | max - take interpolated points max
            });
            omakasePlayer.timeline.addTimelineLane(stereoOveralRmsOgChartLane);
    
            let textLabel20 = new omakase.TextLabel({
                text: `2.0`,
                listening: true,
                style: {
                    align: 'center',
                    verticalAlign: 'middle',
                    fill: '#ffffff',
                    backgroundFill: '#f45844',
                    backgroundBorderRadius: 3
                }
            });
    
            textLabel20.onClick$.subscribe({
                next: (event) => {
                    setActiveAudioTrack('2.0')
                }
            })
    
            omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_AUDIO_SWITCHED, (event) => {
                let style = textLabel20.style
                if ('EN_20' !== omakasePlayer.audio.getCurrentAudioTrack().name) {
                    style.backgroundFill = '#f45844'
                } else {
                    style.backgroundFill = '#008000'
                }
                textLabel20.style = style
            });
    
            stereoAudioTrackLane.addTimelineNode({
                width: 30,
                height: 22,
                justify: 'end',
                margin: [0, 5, 0, 0],
                timelineNode: textLabel20
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
                    listening: false
                })
            });
    
            let iconMinimize20 = new omakase.ImageButton({
                src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
                width: 20,
                height: 20,
                listening: true
            })
    
            iconMinimize20.onClick$.subscribe({
                next: () => {
                    const isMimimized = stereoAudioTrackLaneL.isMinimized();
    
                    stereoAudioTrackLaneL.toggleMinimizeMaximize();
                    stereoAudioTrackLaneR.toggleMinimizeMaximize();
                    stereoRmsBarChartLane.toggleMinimizeMaximize();
                    stereoOveralRmsOgChartLane.toggleMinimizeMaximize();
    
                    let imageConfigExpanded = {
                        src: `https://demo.player.byomakase.org/images/chevron-down.svg`,
                        width: 20,
                        height: 20,
                        listening: true
                    }
                    let imageConfigCollapsed = {
                        src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
                        width: 20,
                        height: 20,
                        listening: true
                    }
                    const imageConfig = isMimimized ? imageConfigExpanded : imageConfigCollapsed;
                    iconMinimize20.setImage(imageConfig).subscribe();
                }
            })
    
            stereoAudioTrackLane.addTimelineNode({
                width: 20,
                height: 20,
                justify: 'start',
                margin: [5, 25, 0, 0],
                timelineNode: iconMinimize20
            });
    
            addSplitLine();
    
            let surroundAudioTrackLane = createNewAudioTrackLane('51_audio_track_lane', '', urls[urlSelector].audioLvl51);
            timeline.addTimelineLane(surroundAudioTrackLane);
    
            let surroundAudioTrackLaneL = createNewAudioTrackLane('51_audio_track_lane_L', 'Left channel', urls[urlSelector].audioLvl51L);
            timeline.addTimelineLane(surroundAudioTrackLaneL);
            surroundAudioTrackLaneL.minimize();
    
            let surroundAudioTrackLaneR = createNewAudioTrackLane('51_audio_track_lane_R', 'Right channel', urls[urlSelector].audioLvl51R);
            timeline.addTimelineLane(surroundAudioTrackLaneR);
            surroundAudioTrackLaneR.minimize();
    
            let surroundAudioTrackLaneC = createNewAudioTrackLane('51_audio_track_lane_C', 'Center channel', urls[urlSelector].audioLvl51C);
            timeline.addTimelineLane(surroundAudioTrackLaneC);
            surroundAudioTrackLaneC.minimize();
    
            let surroundAudioTrackLaneLFE = createNewAudioTrackLane('51_audio_track_lane_LFE', 'LFE channel', urls[urlSelector].audioLvl51LFE);
            timeline.addTimelineLane(surroundAudioTrackLaneLFE);
            surroundAudioTrackLaneLFE.minimize();
    
            let surroundAudioTrackLaneSL = createNewAudioTrackLane('51_audio_track_lane_SL', 'Surround Left channel', urls[urlSelector].audioLvl51SL);
            timeline.addTimelineLane(surroundAudioTrackLaneSL);
            surroundAudioTrackLaneSL.minimize();
    
            let surroundAudioTrackLaneSR = createNewAudioTrackLane('51_audio_track_lane_SR', 'Surround Right channel', urls[urlSelector].audioLvl51SR);
            timeline.addTimelineLane(surroundAudioTrackLaneSR);
            surroundAudioTrackLaneSR.minimize();
    
    
            let textLabel51 = new omakase.TextLabel({
                text: `5.1`,
                listening: true,
                style: {
                    align: 'center',
                    verticalAlign: 'middle',
                    fill: '#ffffff',
                    backgroundFill: '#008000',
                    backgroundBorderRadius: 3
                }
            });
    
            omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_AUDIO_SWITCHED, (event) => {
                let style = textLabel51.style
                if ('EN_51' !== omakasePlayer.audio.getCurrentAudioTrack().name) {
                    style.backgroundFill = '#f45844'
                } else {
                    style.backgroundFill = '#008000'
                }
                textLabel51.style = style
            });
    
            textLabel51.onClick$.subscribe({
                next: (event) => {
                    setActiveAudioTrack('5.1')
                }
            });
    
            surroundAudioTrackLane.addTimelineNode({
                width: 30,
                height: 22,
                justify: 'end',
                margin: [0, 5, 0, 0],
                timelineNode: textLabel51
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
                    listening: false
                })
            });
    
            let iconMinimize51 = new omakase.ImageButton({
                src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
                width: 20,
                height: 20,
                listening: true
            })
    
            iconMinimize51.onClick$.subscribe({
                next: () => {
                    const isMimimized = surroundAudioTrackLaneL.isMinimized();
    
                    surroundAudioTrackLaneL.toggleMinimizeMaximize();
                    surroundAudioTrackLaneR.toggleMinimizeMaximize();
                    surroundAudioTrackLaneC.toggleMinimizeMaximize();
                    surroundAudioTrackLaneLFE.toggleMinimizeMaximize();
                    surroundAudioTrackLaneSL.toggleMinimizeMaximize();
                    surroundAudioTrackLaneSR.toggleMinimizeMaximize();
    
                    let imageConfigExpanded = {
                        src: `https://demo.player.byomakase.org/images/chevron-down.svg`,
                        width: 20,
                        height: 20,
                        listening: true
                    }
                    let imageConfigCollapsed = {
                        src: `https://demo.player.byomakase.org/images/chevron-right.svg`,
                        width: 20,
                        height: 20,
                        listening: true
                    }
                    const imageConfig = isMimimized ? imageConfigExpanded : imageConfigCollapsed;
                    iconMinimize51.setImage(imageConfig).subscribe();
                }
            })
    
            surroundAudioTrackLane.addTimelineNode({
                width: 20,
                height: 20,
                justify: 'start',
                margin: [5, 25, 0, 0],
                timelineNode: iconMinimize51
            });
    
            addSplitLine();
    
            let scrollbarLane = new omakase.ScrollbarLane({
                description: '',
                style: {
                    backgroundFill: "#EDEFFE",
                    height: 25,
                    leftBackgroundFill: '#E4E5E5'
                }
            });
            timeline.addTimelineLane(scrollbarLane);

            // Listening for embedded subtitles load
            processSubtitles();
    
        
        });
    });


    initializePlayerEventListeners();
    initializePlayerControlButtons();


    window.omakasePlayer = omakasePlayer;

});


window.addEventListener('keydown', initializeVuMeter);
window.addEventListener('mousedown', initializeVuMeter);
window.addEventListener('keydown', keyListener);

function processSubtitles() {
    omakasePlayer.subtitles.onSubtitlesLoaded$.subscribe((event) => {
        let subtitlesVttTracks = omakasePlayer.subtitles.getTracks();

        if (subtitlesVttTracks?.[0]) {
            let enClosedCaptionLane = new omakase.SubtitlesLane({
                id: "en_cc_lane",
                description: "",
                vttUrl: subtitlesVttTracks?.[0].src,
                style: {
                    backgroundFill: "#E9F7FF",
                    height: 40,
                    leftBackgroundFill: '#E4E5E5',
                    subtitlesLaneItemOpacity: 0.7,
                    subtitlesLaneItemFill: '#87D798',
                    paddingTop: 10,
                    paddingBottom: 10
                }
            });
            omakasePlayer.timeline.addTimelineLaneAtIndex(enClosedCaptionLane, 11);

            let capEnLabel = new omakase.TextLabel({
                text: `EN`,
                listening: true,
                style: {
                    align: 'center',
                    verticalAlign: 'middle',
                    fill: '#ffffff',
                    backgroundFill: '#008000',
                    backgroundBorderRadius: 3
                }
            });

            omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_SUBTITLES_SHOW, (event) => {
                let style = capEnLabel.style
                if ('eng' !== omakasePlayer.subtitles.getCurrentTrack().language) {
                    style.backgroundFill = '#f45844'
                } else {
                    style.backgroundFill = '#008000'
                }
                capEnLabel.style = style
            });

            capEnLabel.onClick$.subscribe({
                next: (event) => {
                    currentCaption = 'EN'
                    omakasePlayer.subtitles.showTrack(omakasePlayer.subtitles.getTracks()[0].id);
                    document.getElementById('caption').innerHTML = currentCaption;
                }
            })

            enClosedCaptionLane.addTimelineNode({
                width: 30,
                height: 22,
                justify: 'end',
                margin: [0, 5, 0, 0],
                timelineNode: capEnLabel
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
                        fontSize: 15
                    }
                })
            });

            //Decorator
            addSplitLine(undefined, 11);
        }

        // setTimeout(() => {
        //     omakasePlayer.subtitles.showTrack(subtitlesVttTracks?.[0].id)
        // }, 2000)

        // Adding sidecar subtitle to player subtitle selector
        const daDkSubtitles = omakasePlayer.subtitles.createVttTrack({
            id: '1',
            src: urls[urlSelector].dkSubtitle,
            label: 'DK',
            language: 'da-dk',
            default: false
        }).subscribe(daDkSubtitles => {
            console.debug(daDkSubtitles);
        });
    });
}

function createNewAudioTrackLane(id, description, url) {
    return new omakase.AudioTrackLane({
        id: id,
        description: description,
        vttUrl: url,
        style: {
            backgroundFill: "#E9F7FF",
            paddingTop: 0,
            paddingBottom: 0,
            height: 40,
            itemWidth: 3,
            itemMinPadding: 1,
            itemCornerRadius: 2,
            maxSampleFillLinearGradientColorStops: [0, '#ff0099', 0.2, 'yellow', 1, 'green'],
            minSampleFillLinearGradientColorStops: [0, 'green', 0.8, 'yellow', 1, 'red'],
            leftBackgroundFill: '#E4E5E5'
        }
    })
}

function initializePlayerEventListeners() {
    omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_VIDEO_TIME_CHANGE, (event) => {
        document.getElementById('inputFrameSeek').innerHTML = event.frame;
        document.getElementById('inputTimestamp').innerHTML = event.currentTime.toFixed(3);
        document.getElementById('inputTimestampFormatted').innerHTML = omakasePlayer.video.formatToTimecode(event.currentTime);
    });

    omakasePlayer.video.onEnded$.subscribe((event) => {
        document.getElementById('buttonReplay').style.display = "inline";
        document.getElementById('buttonPause').style.display = "none";
        document.getElementById('buttonPlay').style.display = "none";
    });

    omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_VIDEO_LOADED, (event) => {
        console.debug('Video Loaded', event);

        if (!event) {
            return;
        }

        omakasePlayer.video.onPlay$.subscribe(() => {
            document.getElementById('buttonPause').style.display = "inline";
            document.getElementById('buttonReplay').style.display = "none";
            buttonPlay.style.display = "none";
        });

        omakasePlayer.video.onPause$.subscribe(() => {
            document.getElementById('buttonPlay').style.display = "inline";
            document.getElementById('buttonReplay').style.display = "none";
            buttonPause.style.display = "none";
        });
    });
}

function initializePlayerControlButtons() {
    let buttonPlay = document.getElementById('buttonPlay');
    buttonPlay.onclick = function () {
        omakasePlayer.video.play();
    }

    let buttonPause = document.getElementById('buttonPause');
    buttonPause.onclick = function () {
        omakasePlayer.video.pause();
    }

    let buttonFfBack = document.getElementById('ff-back');
    buttonFfBack.onclick = function () {
        omakasePlayer.video.pause();
        document.getElementById('buttonPlay').style.display = "inline";
        document.getElementById('buttonReplay').style.display = "none";
        buttonPause.style.display = "none";
        let frame = omakasePlayer.video.getCurrentFrame();
        if (frame < 10) {
            frame = 0;
        } else {
            frame = frame - 10;
        }
        omakasePlayer.video.seekToFrame(frame).subscribe(() => {
        });
    }

    let buttonBack = document.getElementById('back');
    buttonBack.onclick = function () {
        omakasePlayer.video.pause();
        document.getElementById('buttonPlay').style.display = "inline";
        document.getElementById('buttonReplay').style.display = "none";
        buttonPause.style.display = "none";

        omakasePlayer.video.seekPreviousFrame().subscribe(() => {
        });
    }

    let buttonFfForward = document.getElementById('ff-forward');
    buttonFfForward.onclick = function () {
        omakasePlayer.video.pause();
        document.getElementById('buttonPlay').style.display = "inline";
        document.getElementById('buttonReplay').style.display = "none";
        buttonPause.style.display = "none";

        let frame = omakasePlayer.video.getCurrentFrame();
        if (frame + 10 >= omakasePlayer.video.getVideo().totalFrames) {
            frame = omakasePlayer.video.getVideo().totalFrames;
        } else {
            frame = frame + 10;
        }
        omakasePlayer.video.seekToFrame(frame).subscribe(() => {
        });
    }

    let buttonForward = document.getElementById('forward');
    buttonForward.onclick = function () {
        omakasePlayer.video.pause();
        document.getElementById('buttonPlay').style.display = "inline";
        document.getElementById('buttonReplay').style.display = "none";
        buttonPause.style.display = "none";

        let frame = omakasePlayer.video.getCurrentFrame();
        if (frame + 1 >= omakasePlayer.video.getVideo().totalFrames) {
            frame = omakasePlayer.video.getVideo().totalFrames;
        } else {
            frame = frame + 1;
        }
        omakasePlayer.video.seekToFrame(frame).subscribe(() => {
        });
    }

    // Playback rate toggle and indicator
    let buttonPlayback = document.getElementById('playback');
    buttonPlayback.onclick = function () {
        togglePlayback();
    }

    // Audio toggle and indicator
    let buttonMute = document.getElementById('mute');
    let muted = false;
    buttonMute.onclick = function () {
        if (muted) {
            buttonMute.style.opacity = "1";
            omakasePlayer.video.unmute();
            muted = false;
        } else {
            buttonMute.style.opacity = "0.5";
            omakasePlayer.video.mute();
            muted = true;
        }
    }
    let buttonAudio = document.getElementById('audio');
    buttonAudio.onclick = function () {
        toggleAudio();
        buttonAudio.innerHTML = currentAudio;
    }

    // Captions toggle and indicator
    let buttonSub = document.getElementById('sub');
    buttonSub.onclick = function () {
        let currentTrack = omakasePlayer.subtitles.getCurrentTrack();
        if (currentTrack.hidden) {
            omakasePlayer.subtitles.showActiveTrack();
            buttonSub.style.opacity = "1";
        } else {
            omakasePlayer.subtitles.hideActiveTrack();
            buttonSub.style.opacity = "0.5";
        }
    }
    let buttonCaption = document.getElementById('caption');
    buttonCaption.onclick = function () {
        toggleCaptions();
        buttonCaption.innerHTML = currentCaption;
    }

    let buttonPlayheadToIn = document.getElementById('playhead-to-in');
    buttonPlayheadToIn.onclick = setPlayheadToInMarker;

    let buttonPlayheadToOut = document.getElementById('playhead-to-out');
    buttonPlayheadToOut.onclick = setPlayheadToOutMarker;

    let buttonInToPlayhead = document.getElementById('in-to-playhead');
    buttonInToPlayhead.onclick = setInMarkerToPlayhead;

    let buttonOutToPlayhead = document.getElementById('out-to-playhead');
    buttonOutToPlayhead.onclick = setOutMarkertoPlayhead;

    let buttonSafeZoneOn = document.getElementById('safe-zone-on');
    buttonSafeZoneOn.onclick = function () {
        enableSafeZone(true);
    }

    let buttonSafeZoneOff = document.getElementById('safe-zone-off');
    buttonSafeZoneOff.onclick = function () {
        enableSafeZone(false);
    }

    let buttonFullscreen = document.getElementById('full-screen');
    buttonFullscreen.onclick = function () {
        omakasePlayer.video.toggleFullscreen();
    };

    document.getElementById('addMarker').onclick = addMarker;
    let initialMarker = document.getElementById('marker1');
    initialMarker.onclick = function () {
        toggleMarkers(initialMarker);
    };
}

function initializeVuMeter(event) {
    if (!audioContext) {
        document.removeEventListener('keydown', initializeVuMeter);
        document.removeEventListener('mousedown', initializeVuMeter);
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();

        let splitterNode = new ChannelSplitterNode(audioContext, {numberOfOutputs: 6});
        let mergerNode = new ChannelMergerNode(audioContext, {numberOfInputs: 6});

        let audioSource = audioContext.createMediaElementSource(document.getElementsByClassName('omakase-video')[0]);
        audioSource.channelCountMode = "max";
        audioSource.channelCount = 6;
        audioContext.destination.channelCount = audioContext.destination.maxChannelCount < 6 ? 2 : 6;
        audioSource.connect(audioContext.destination);
        document.getElementsByClassName('omakase-video')[0].volume = 1;
        var meterElement = document.getElementById('peak-meter');
        var meterNode = webAudioPeakMeter.createMeterNode(audioSource, audioContext);
        var meterOptions = {
            backgroundColor: '#EEEFEE',
            tickColor: '#70849A',
            labelColor: '#70849A',
            fontSize: 12,
            dbRange: 60,
            dbTickSize: 6,
            font: 'Arial'
        };
        webAudioPeakMeter.createMeter(meterElement, meterNode, meterOptions);
        audioContext.resume();
    }
}

function addSplitLine(idPrefix = undefined, index = undefined) {
    let splitLane = new omakase.MarkerLane({
        id: idPrefix !== undefined ? 'sl' + splitLaneId++ : idPrefix,
        description: '',
        style: {
            backgroundFill: '#E9F7FF',
            height: 1,
            leftBackgroundFill: '#E9F7FF'
        }
    });
    if (index !== undefined) {
        omakasePlayer.timeline.addTimelineLaneAtIndex(splitLane, index);
    } else {
        omakasePlayer.timeline.addTimelineLane(splitLane);
    }
    return splitLane;
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
        toggleMarkers();
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

function play() {
    omakasePlayer.video.play();
    document.getElementById('buttonPause').style.display = "inline";
    document.getElementById('buttonPlay').style.display = "none";
}

function pause() {
    omakasePlayer.video.pause();
    document.getElementById('buttonPlay').style.display = "inline";
    document.getElementById('buttonPause').style.display = "none";
    buttonPause.style.display = "none";
}

function seekPreviousFrame() {
    pause();

    omakasePlayer.video.seekPreviousFrame().subscribe(() => {
    });
}

function seekNextFrame() {
    pause();
    let frame = omakasePlayer.video.getCurrentFrame();
    if (frame + 1 >= omakasePlayer.video.getVideo().totalFrames) {
        frame = omakasePlayer.video.getVideo().totalFrames;
    } else {
        frame = frame + 1;
    }
    omakasePlayer.video.seekToFrame(frame).subscribe(() => {
    });
}

function navigateBackwardsInSeconds(numOfSecs) {
    pause();

    let frameRate = omakasePlayer.video.getFrameRate();
    let frame = omakasePlayer.video.getCurrentFrame();
    let framesToMove = numOfSecs * frameRate;
    console.debug("Frames to move backwards", framesToMove);

    if (framesToMove > frame) {
        frame = 0;
    } else {
        frame = frame - framesToMove;
    }
    omakasePlayer.video.seekToFrame(frame).subscribe(() => {
    });
}

function navigateForwardsInSeconds(numOfSecs) {
    pause();

    let frameRate = omakasePlayer.video.getFrameRate();
    let frame = omakasePlayer.video.getCurrentFrame();
    let totalFrames = omakasePlayer.video.getVideo().totalFrames;
    let framesToMove = numOfSecs * frameRate;
    console.debug("Frames to move forwards", framesToMove);

    if (frame + framesToMove >= totalFrames) {
        frame = totalFrames;
    } else {
        frame = frame + framesToMove;
    }
    omakasePlayer.video.seekToFrame(frame).subscribe(() => {
    });
}

function setActiveMarker(index) {
    let markerLane = omakasePlayer.timeline.getTimelineLane('marker_lane_inout_1');
    activeMarker = markerLane.getMarkers()[index];
    let activeMarkerStyle = activeMarker?.style;
    if (activeMarkerStyle) {
        activeMarkerStyle.renderType = "spanning";
        activeMarker.style = activeMarkerStyle;
    }

    console.debug('New active marker index', index);
    console.debug('New active marker id', activeMarker.id);
}

function toggleMarkers(marker) {
    let markerLane = omakasePlayer.timeline.getTimelineLane('marker_lane_inout_1');
    const activeMarkerIndex = markerLane.getMarkers().indexOf(activeMarker);
    console.debug('Old active marker index', activeMarkerIndex);

    if (activeMarkerIndex >= 0) {
        let oldActiveMarkerStyle = activeMarker?.style;
        if (oldActiveMarkerStyle) {
            oldActiveMarkerStyle.renderType = "lane";
            activeMarker.style = oldActiveMarkerStyle;
        }
    }

    if (activeMarkerIndex !== -1) {
        document.getElementById("marker" + (activeMarkerIndex + 1)).style.opacity = "0.7";
        document.getElementById("marker" + (activeMarkerIndex + 1)).style.backgroundColor = "white";
    }
    if (marker === undefined) {
        if (activeMarkerIndex === markerLane.getMarkers().length - 1) {
            setActiveMarker(0);
            document.getElementById("marker1").style.opacity = "1";
            document.getElementById("marker1").style.backgroundColor = "#24506724";
        } else {
            setActiveMarker(activeMarkerIndex + 1);
            document.getElementById("marker" + (activeMarkerIndex + 2)).style.opacity = "1";
            document.getElementById("marker" + (activeMarkerIndex + 2)).style.backgroundColor = "#24506724";
        }
    } else {
        setActiveMarker(marker.id.substring(6) - 1);
        marker.style.opacity = "1";
        marker.style.backgroundColor = "#24506724";
    }
}

function setInMarkerToPlayhead() {
    console.debug("set IN Marker to Playhead", activeMarker.id);

    let playhead = omakasePlayer.video.getCurrentTime();
    let timeObservation = activeMarker.timeObservation;
    if (playhead <= timeObservation.end) {
        timeObservation.start = playhead;
        activeMarker.timeObservation = timeObservation;
    }
}

function setOutMarkertoPlayhead() {
    console.debug("set OUT Marker to Playhead", activeMarker.id);

    let playhead = omakasePlayer.video.getCurrentTime();
    let timeObservation = activeMarker.timeObservation;
    if (timeObservation.start <= playhead) {
        timeObservation.end = playhead;
        activeMarker.timeObservation = timeObservation;
    }
}

function setPlayheadToInMarker() {
    console.debug("set Playhead to IN Marker", activeMarker.id);
    let inTimeStamp = activeMarker.timeObservation.start;
    omakasePlayer.video.seekToTime(inTimeStamp).subscribe(() => {
    });
}

function setPlayheadToOutMarker() {
    console.debug("set Playhead to OUT Marker", activeMarker.id);
    let outTimeStamp = activeMarker.timeObservation.end;
    omakasePlayer.video.seekToTime(outTimeStamp).subscribe(() => {
    });
}

function addMarker() {
    console.debug("Adding marker at frame", omakasePlayer.video.getCurrentFrame());
    if (markerId > 8) return;
    let markerLane = omakasePlayer.timeline.getTimelineLane('marker_lane_inout_1');
    let color = markerColors[markerId];
    let periodMarker = markerLane.addMarker(new omakase.PeriodMarker({
        id: "periodMarker" + markerId,
        timeObservation: {
            start: omakasePlayer.video.getCurrentTime(),
            end: omakasePlayer.video.getCurrentTime() + 20
        },
        style: {
            symbolType: 'triangle',
            color: color,
            renderType: 'spanning',
        },
        editable: true
    }));
    let markersDiv = document.getElementById('markers');

    let marker = document.createElement("div");
    marker.id = "marker" + markerId;

    marker.style.paddingLeft = "0px";
    marker.style.opacity = "0.7";
    marker.style.borderLeft = "5px solid " + color;
    marker.style.height = "45px";
    marker.style.borderBottom = "2px solid #235067";
    marker.style.borderRight = "2px solid #235067";

    let divMarkerImage = document.createElement("div");
    divMarkerImage.className = "marker-image";

    let divMarkerDetails = document.createElement("div");
    divMarkerDetails.className = "marker-details";

    let markerImage = document.createElement("img");
    console.log("omakasePlayer.timeline.getTimelineLane('thumbnail_lane_default').vttFile")
    console.log(omakasePlayer.timeline.getTimelineLane('thumbnail_lane_default').vttFile)
    markerImage.src = omakasePlayer.timeline.getTimelineLane('thumbnail_lane_default').vttFile.findCues(omakasePlayer.video.getCurrentTime(), omakasePlayer.video.getCurrentTime() + 20)[0].url;
    markerImage.height = 45;

    let divName = document.createElement("div");
    let spanName = document.createElement("span");
    spanName.style = "display: inline-block; width: 100px; font-weight: bold";
    spanName.innerHTML = "Marker " + markerId;

    let divStart = document.createElement("div");
    let spanStart = document.createElement("span");
    spanStart.style = "display: inline-block; width: 35px; font-weight: bold";
    spanStart.innerHTML = "IN:";
    let spanStartValue = document.createElement("span");
    spanStartValue.innerHTML = "";

    let divEnd = document.createElement("div");
    let spanEnd = document.createElement("span");
    spanEnd.style = "display: inline-block; width: 35px; font-weight: bold";
    spanEnd.innerHTML = "OUT:";
    let spanEndValue = document.createElement("span");
    spanEndValue.innerHTML = "";

    divMarkerImage.append(markerImage);
    divName.append(spanName);
    divStart.append(spanStart);
    divStart.append(spanStartValue);
    divEnd.append(spanEnd);
    divEnd.append(spanEndValue);
    divMarkerDetails.appendChild(divName);
    divMarkerDetails.appendChild(divStart);
    divMarkerDetails.appendChild(divEnd);
    marker.appendChild(divMarkerImage);
    marker.appendChild(divMarkerDetails);

    //marker.appendChild(document.createElement('br'));
    markersDiv.appendChild(marker)
    toggleMarkers(marker);

    markerId++;
    spanStartValue.innerHTML = omakasePlayer.video.formatToTimecode(omakasePlayer.video.getCurrentTime());
    spanEndValue.innerHTML = omakasePlayer.video.formatToTimecode(omakasePlayer.video.getCurrentTime() + 20);

    periodMarker.onChange$.subscribe((event) => {
        spanStartValue.innerHTML = omakasePlayer.video.formatToTimecode(event.timeObservation.start);
        spanEndValue.innerHTML = omakasePlayer.video.formatToTimecode(event.timeObservation.end);
        markerImage.src = omakasePlayer.timeline.getTimelineLane('thumbnail_lane_default').vttFile.findCues(event.timeObservation.start, event.timeObservation.start + 20)[0].url;
    });

    marker.onclick = function () {
        toggleMarkers(marker);
    };

    if (markerId > 8) {
        document.getElementById('addMarker').remove();
    }
}

function setPlaybackRate(speed) {
    omakasePlayer.video.setPlaybackRate(speed);
    currentSpeed = speed;
    document.getElementById('playback').innerHTML = "Speed: " + speed + "x";
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

    if (activeAudioIndex === audios.length - 1) {
        currentAudio = audios[0];
        omakasePlayer.audio.setAudioTrack(0);
        document.getElementById('vu-label-surround').style.display = "inline-block";
    } else {
        currentAudio = audios[activeAudioIndex + 1];
        omakasePlayer.audio.setAudioTrack(activeAudioIndex + 1);
        document.getElementById('vu-label-surround').style.display = "none";
    }
}

function setActiveAudioTrack(audio) {
    let activeAudioIndex = audios.indexOf(currentAudio);

    currentAudio = audio;
    omakasePlayer.audio.setAudioTrack(0);

    if ('5.1' === audio) {
        currentAudio = audios[0];
        omakasePlayer.audio.setAudioTrack(0);
        document.getElementById('vu-label-surround').style.display = "inline-block";
    } else {
        omakasePlayer.audio.setAudioTrack(1);
        document.getElementById('vu-label-surround').style.display = "none";
    }
    document.getElementById('audio').innerHTML = currentAudio;
}

function enableSafeZone(safeZone) {
    if (safeZone) {
        omakasePlayer.video.clearSafeZones()
        document.getElementById('safe-zone-on').style.display = "none";
        document.getElementById('safe-zone-off').style.display = "inline";
    } else {
        omakasePlayer.video.addSafeZone({
                topRightBottomLeftPercent: [10, 10, 10, 10]
            }
        )
        omakasePlayer.video.addSafeZone({
                topRightBottomLeftPercent: [20, 20, 20, 20]
            }
        )
        document.getElementById('safe-zone-on').style.display = "inline";
        document.getElementById('safe-zone-off').style.display = "none";
    }
}

function addZoomButtons() {
    let scrubberLane = omakasePlayer.timeline.getScrubberLane();

    // define zoom in button
    let zoomInButton = new omakase.ImageButton({
        src: `https://demo.player.byomakase.org/images/plus-circle.svg`,
        width: 20,
        height: 20,
        listening: true // set to true if button is interactive
    })

    // handle click event
    zoomInButton.onClick$.subscribe({
        next: (event) => {
            omakasePlayer.timeline.zoomInEased().subscribe();
        }
    })

    // define zoom out button
    let zoomOutButton = new omakase.ImageButton({
        src: `https://demo.player.byomakase.org/images/minus-circle.svg`,
        width: 20,
        height: 20,
        listening: true
    })

    // handle click event
    zoomOutButton.onClick$.subscribe({
        next: (event) => {
            omakasePlayer.timeline.zoomOutEased().subscribe();
        }
    });

    // add buttons to scrubber lane
    [zoomOutButton, zoomInButton].forEach(button => {
        scrubberLane.addTimelineNode({
            width: button.config.width,
            height: button.config.height,
            justify: 'end',
            margin: [8, 5, 5, 5],
            timelineNode: button,
        })
    });
}

function detectBrowser() {
    let userAgent = window.navigator && window.navigator.userAgent || '';

    let isAndroid = (/Android/i).test(userAgent);
    let isFirefox = (/Firefox/i).test(userAgent);
    let isEdge = (/Edg/i).test(userAgent);
    let isChromium = ((/Chrome/i).test(userAgent) || (/CriOS/i).test(userAgent));
    let isChrome = !isEdge && isChromium;
    let isSafari = (/Safari/i).test(userAgent) && !isChrome && !isAndroid && !isEdge;

    let useChrome = "For the best experience, please use Chrome browser.";
    if (isFirefox) {
        alert("Firefox browser is not supported. " + useChrome);
    } else if (isSafari) {
        alert("Audio meter is not supported in Safari browser. " + useChrome);
    } else if (!isChrome) {
        alert(useChrome)
    }
}

function subscribeToComments(poiLane) {
    return poiLane.onVideoCueEvent$
      .subscribe((event) => {
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
    return bitrateLane.onVideoCueEvent$
      .subscribe((event) => {
        if (event.action === 'entry') {
            omakasePlayer.alerts.warn(`Bitrate: ${event.cue.value}`, { autodismiss: true, duration: 2500 });
        }
      });
}
