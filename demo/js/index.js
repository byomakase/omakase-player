let activeMarker = null;
let currentSpeed = 1;
let currentAudio = '5.1';
let currentCaption = 'EN';
let speeds = [0.25, 0.5, 0.75, 1, 2, 4, 8];
let captions = ['EN', 'DK'];
let audios = ['5.1', '2.0'];
let audioContext = null;
let markerId = 2;
let markerColors = ['#E4ABFF', '#6AC7F6', '#A007E8', '#FCD004', '#009CEB', '#5E1879', '#4D79A7', '#A481B5', '#5A6C80', '#2B299E', '#EE9247', '#520160', '#863800', '#CD5600'];
let urls = [
    {
        video: 'https://demo.player.byomakase.org/data/hls/CPL_MER_SHR_C_EN-XX_US-NR_51_LTRT_UHD_20160913_OV_a8f500d1-ba98-4598-815b-54fa640661d6_SDR_TC_NOSLOW_PAL.m3u8',
        thumbnails: 'https://demo.player.byomakase.org/data/thumbnails/timeline.vtt',
        enCaption: 'https://demo.player.byomakase.org/data/subtitles/meridian_en_cc_11m58s.vtt',
        dkSubtitle: 'https://demo.player.byomakase.org/data/subtitles/meridian_da_subs_11m58s.vtt',
        audioLvl20: 'https://demo.player.byomakase.org/data/audio-levels/MER_SHR_C_EN-XX_US-NR_51_LTRT_UHD_20160913_OV_01_EN_20_B.vtt',
        audioLvl51: 'https://demo.player.byomakase.org/data/audio-levels/MER_SHR_C_EN-XX_US-NR_51_LTRT_UHD_20160913_OV_01_EN_51_A.vtt'
    }];

let urlSelector = 0;

detectBrowser();

window.addEventListener('load', () => {
    let omakasePlayer = new omakase.OmakasePlayer({
        videoHTMLElementId: 'omakase-video',
        style: {
            fontFamily: 'Arial'
        }
    });

    omakasePlayer.loadVideo(urls[urlSelector].video, 25).subscribe();
    omakasePlayer.createTimeline({
        thumbnailVttUrl: urls[urlSelector].thumbnails,
        style:
            {
                stageMinWidth: 700,
                backgroundFill: '#E4E5E5',
                headerBackgroundFill: '#EDEFEE',
                footerBackgroundFill: '#EDEFEE',

                playProgressBarHeight: 12,
                scrollbarHeight: 12,

                thumbnailHoverWidth: 200,
                thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
                thumbnailHoverStrokeWidth: 5,
                thumbnailHoverYOffset: 0,

                headerHeight: 20,
                footerHeight: 20,
                leftPanelWidth: 250,
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
                playheadBufferedOpacity: 1
            }
    }).subscribe(timeline => {

        timeline.getScrubberLane().style = {
            backgroundFill: '#EDEFEE',
            leftBackgroundFill: '#E4E5E5'
        }
        
        //Creating Marker Lane
        let inAndOutMarkersLane = new omakase.MarkerLane({
            id: "marker_lane_inout_1", description: "In and out markers",
            style: {
                backgroundFill: '#E9F7FF',
                height: 30,
                leftBackgroundFill: '#E4E5E5',
            }
        });

        timeline.addLane(inAndOutMarkersLane);

        inAndOutMarkersLane.onMarkerFocus$.subscribe((event) => {
            console.debug("event id" + event.marker.id)
            let markerLane = omakasePlayer.timeline.getLane('marker_lane_inout_1');
            let marker = document.getElementById("marker" + event.marker.id.substring(12));
            if (event.marker.id.substring(12) != markerLane.markers.indexOf(activeMarker) + 1) {
                toggleMarkers(marker);
            }
        })

        //Adding sample Range marker to Marker Lane
        let periodMarker1 = inAndOutMarkersLane.addMarker(new omakase.PeriodMarker({
            id: "periodMarker1",
            observation: {
                start: 10.001,
                end: 33
            },
            style: {
                symbolType: 'triangle',
                color: markerColors[1],
                renderType: 'spanning'
            }
        }));

        toggleMarkers();

        periodMarker1.onChange$.subscribe((event) => {
            document.getElementById('markerStart').innerHTML = omakasePlayer.video.formatTimestamp(event.timeObservation.start);
            document.getElementById('markerEnd').innerHTML = omakasePlayer.video.formatTimestamp(event.timeObservation.end);
            let markerImage = document.getElementById('predefined-image');
            markerImage.src = markerImage.src = omakasePlayer.timeline.getLane('thumbnail_lane_default').getThumbnailVttFile().findCues(event.timeObservation.start, event.timeObservation.start + 20)[0].url;
        });

        //Decorator (blue line)
        let splitLane1 = new omakase.MarkerLane({
            id: 'sl1',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 1,
                leftBackgroundFill: '#E9F7FF'
            }
        });
        timeline.addLane(splitLane1);

        //Point Marker Lane
        let pointsMarkersLane = new omakase.MarkerLane({
            id: "marker_lane_points_1", description: "Points of interest",
            style: {
                backgroundFill: '#E9F7FF',
                height: 30,
                leftBackgroundFill: '#E4E5E5',
            }
        });

        timeline.addLane(pointsMarkersLane);

        let point1time = 43;
        let point2time = 561;

        let pointMarker1 = pointsMarkersLane.addMarker(new omakase.MomentMarker({
            id: "moment_marker_1",
            observation: {
                time: point1time
            },
            editable: false,
            style: {
                symbolType: 'square',
                color: '#2B299E',
                renderType: 'lane'
            }
        }));

        let pointMarker2 = pointsMarkersLane.addMarker(new omakase.MomentMarker({
            id: "moment_marker_2",
            observation: {
                time: point2time
            },
            editable: false,
            style: {
                symbolType: 'square',
                color: '#5A6C80',
                renderType: 'lane'
            }
        }));

        let spanningMarker = pointsMarkersLane.addMarker(new omakase.PeriodMarker({
            id: "spanning_marker_2",
            observation: {
                start: point1time + 50,
                end: point2time - 50
            },
            editable: false,
            style: {
                symbolType: 'triangle',
                color: '#E4ABFF',
                renderType: 'lane'
            }
        }));

        pointMarker1.onClick$.subscribe(() => {
            omakasePlayer.video.seekToTimestamp(point1time).subscribe(() => {
            });
        });

        pointMarker2.onClick$.subscribe(() => {
            omakasePlayer.video.seekToTimestamp(point2time).subscribe(() => {
            });
        });

        //Decorator (blue line)
        let splitLane1b = new omakase.MarkerLane({
            id: 'sl1b',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 1,
                leftBackgroundFill: '#E9F7FF'
            }
        });
        timeline.addLane(splitLane1b);

        //Adding Thumbnal Lane to timeline
        let defaultThumbnailLane = new omakase.ThumbnailLane({
            id: "thumbnail_lane_default",
            description: "Thumbnails",
            thumbnailVttUrl: urls[urlSelector].thumbnails,
            style: {
                backgroundFill: '#E9F7FF',
                height: 50,
                leftBackgroundFill: '#E4E5E5',
                thumbnailHoverScale: 2
            }
        });

        //automatic position to thumb start frame
        defaultThumbnailLane.onClick$.subscribe((event) => {
            omakasePlayer.video.seekToTimestamp(event.thumbnail.getThumbnailVttCue().startTime).subscribe(() => {
            });
        });

        timeline.addLane(defaultThumbnailLane);

        //Decorator
        let splitLane2 = new omakase.MarkerLane({
            id: 'sl2',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 1,
                leftBackgroundFill: '#E9F7FF'
            }
        });
        timeline.addLane(splitLane2);

        //Decorator
        let splitLane3 = new omakase.MarkerLane({
            id: 'sl3',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 10,
                leftBackgroundFill: '#E4E5E5'
            }
        });
        timeline.addLane(splitLane3);

        let subtitlesLane1 = new omakase.SubtitlesLane({
            id: "subtitles_lane_1",
            description: "English Caption",
            subtitlesVttUrl: urls[urlSelector].enCaption,
            style: {
                backgroundFill: "#E9F7FF",
                height: 20,
                leftBackgroundFill: '#E4E5E5',
                subtitlesLaneItemOpacity: 0.7,
                subtitlesLaneItemFill: '#87D798'
            }
        });
        timeline.addLane(subtitlesLane1);


        //Decorator
        let splitLane4 = new omakase.MarkerLane({
            id: 'sl4',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 10,
                leftBackgroundFill: '#E4E5E5'
            }
        });

        timeline.addLane(splitLane4);

        let splitLane5 = new omakase.MarkerLane({
            id: 'sl5',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 1,
                leftBackgroundFill: '#E9F7FF'
            }
        });
        timeline.addLane(splitLane5);

        //Decorator
        let splitLane6 = new omakase.MarkerLane({
            id: 'sl6',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 10,
                leftBackgroundFill: '#E4E5E5'
            }
        });

        timeline.addLane(splitLane6);

        let subtitlesLane2 = new omakase.SubtitlesLane({
            id: "subtitles_lane_2",
            description: "Danish Subtitle",
            subtitlesVttUrl: urls[urlSelector].dkSubtitle,
            style: {
                backgroundFill: "#E9F7FF",
                height: 20,
                leftBackgroundFill: '#E4E5E5',
                subtitlesLaneItemOpacity: 0.7,
                subtitlesLaneItemFill: '#87D798'
            }
        });

        timeline.addLane(subtitlesLane2);

        let splitLane7 = new omakase.MarkerLane({
            id: 'sl7',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 10,
                leftBackgroundFill: '#E4E5E5'
            }
        });
        timeline.addLane(splitLane7);

        let splitLane8 = new omakase.MarkerLane({
            id: 'sl8',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 1,
                leftBackgroundFill: '#E9F7FF'
            }
        });
        timeline.addLane(splitLane8);

        let audioTrackLane1 = new omakase.AudioTrackLane({
            id: 'audio_track_lane_1',
            description: '2.0 audio track',
            audioVttFileUrl: urls[urlSelector].audioLvl20,
            style: {
                backgroundFill: "#E9F7FF",
                paddingTop: 5,
                paddingBottom: 5,
                height: 40,
                itemWidth: 3,
                itemMinPadding: 1,
                itemCornerRadius: 2,
                maxSampleFillLinearGradientColorStops: [0, '#ff0099', 0.2, 'yellow', 1, 'green'],
                minSampleFillLinearGradientColorStops: [0, 'green', 0.8, 'yellow', 1, 'red'],
                leftBackgroundFill: '#E4E5E5'
            }
        });
        timeline.addLane(audioTrackLane1);


        let splitLane9 = new omakase.MarkerLane({
            id: 'sl9',
            description: '',
            style: {
                backgroundFill: '#E9F7FF',
                height: 1,
                leftBackgroundFill: '#E9F7FF'
            }
        });
        timeline.addLane(splitLane9);


        let audioTrackLane2 = new omakase.AudioTrackLane({
            id: 'audio_track_lane_2',
            description: '5.1 audio track',
            audioVttFileUrl: urls[urlSelector].audioLvl51,
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
        });
        timeline.addLane(audioTrackLane2);
    });


    omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_VIDEO_TIME_CHANGE, (event) => {
        document.getElementById('inputFrameSeek').innerHTML = event.frame;
        document.getElementById('inputTimestamp').innerHTML = event.currentTime.toFixed(3);
        document.getElementById('inputTimestampFormatted').innerHTML = omakasePlayer.video.formatTimestamp(event.currentTime);
    });

    omakasePlayer.video.onEnded$.subscribe((event) => {
        document.getElementById('buttonReplay').style.display = "inline";
        document.getElementById('buttonPause').style.display = "none";
        document.getElementById('buttonPlay').style.display = "none";
    });


    omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_VIDEO_LOADED, (event) => {
        console.debug('Video Loaded', event);


        let enUsSubtitles = omakasePlayer.subtitles.createVttTrack({
            id: '0',
            src: urls[urlSelector].enCaption,
            label: 'EN',
            language: 'en-us',
            default: true
        }).subscribe(enUsSubtitles => {
            omakasePlayer.subtitles.showTrack(enUsSubtitles.id);
        });

        let daDkSubtitles = omakasePlayer.subtitles.createVttTrack({
            id: '1',
            src: urls[urlSelector].dkSubtitle,
            label: 'DK',
            language: 'da-dk',
            default: false
        }).subscribe(daDkSubtitles => {
            console.debug(daDkSubtitles);
        });

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
        let subtitles = false;
        buttonSub.onclick = function () {
            let activeCaptionIndex = captions.indexOf(currentCaption);
            if (subtitles) {
                buttonSub.style.opacity = "1";
                omakasePlayer.subtitles.showTrack(String(activeCaptionIndex));
                subtitles = false;
            } else {
                buttonSub.style.opacity = "0.5";
                omakasePlayer.subtitles.hideTrack(String(activeCaptionIndex));
                subtitles = true;
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

        let buttonFullscreen = document.getElementById('full-screen');
        buttonFullscreen.onclick = function () {
            omakasePlayer.video.toggleFullscreen();
        };
    })

    function pause() {
        omakasePlayer.video.pause();
        document.getElementById('buttonPlay').style.display = "inline";
        document.getElementById('buttonReplay').style.display = "none";
        buttonPause.style.display = "none";
    }

    window.omakasePlayer = omakasePlayer;

});


window.addEventListener('keydown', initializeVuMeter);
window.addEventListener('mousedown', initializeVuMeter);
window.addEventListener('keydown', keyListener);

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
        audioContext.destination.channelCount = 2;
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
}

function seekPreviousFrame() {
    pause();

    omakasePlayer.video.seekPreviousFrame().subscribe(() => {
    });
}

function seekNextFrame() {
    pause();
    omakasePlayer.timeline.getLane('subtitles_lane_1').subtitlesVttUrl = urls[urlSelector].dkSubtitle;
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
    let markerLane = omakasePlayer.timeline.getLane('marker_lane_inout_1');
    //markerLane.focusMarker
    activeMarker = markerLane.markers[index];
    let activeMarkerStyle = activeMarker?.style;
    if (activeMarkerStyle) {
        activeMarkerStyle.renderType = "spanning";
        activeMarker.setStyle(activeMarkerStyle);
    }

    console.debug('New active marker index', index);
    console.debug('New active marker id', activeMarker.id);
}

function toggleMarkers(marker) {
    let markerLane = omakasePlayer.timeline.getLane('marker_lane_inout_1');
    const activeMarkerIndex = markerLane.markers.indexOf(activeMarker);
    console.debug('Old active marker index', activeMarkerIndex);

    if (activeMarkerIndex >= 0) {
        let oldActiveMarkerStyle = activeMarker?.style;
        if (oldActiveMarkerStyle) {
            oldActiveMarkerStyle.renderType = "lane";
            activeMarker.setStyle(oldActiveMarkerStyle);
        }
    }

    if (activeMarkerIndex !== -1) {
        document.getElementById("marker" + (activeMarkerIndex + 1)).style.opacity = "0.7";
        document.getElementById("marker" + (activeMarkerIndex + 1)).style.backgroundColor = "white";
    }
    if (marker === undefined) {
        if (activeMarkerIndex === markerLane.markers.length - 1) {
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
    let timeObservation = activeMarker.getTimeObservation();
    if (playhead <= timeObservation.end) {
        timeObservation.start = playhead;
        activeMarker.setTimeObservation(timeObservation);
    }
}

function setOutMarkertoPlayhead() {
    console.debug("set OUT Marker to Playhead", activeMarker.id);

    let playhead = omakasePlayer.video.getCurrentTime();
    let timeObservation = activeMarker.getTimeObservation();
    if (timeObservation.start <= playhead) {
        timeObservation.end = playhead;
        activeMarker.setTimeObservation(timeObservation);
    }
}

function setPlayheadToInMarker() {
    console.debug("set Playhead to IN Marker", activeMarker.id);
    let inTimeStamp = activeMarker.getTimeObservation().start;
    omakasePlayer.video.seekToTimestamp(inTimeStamp).subscribe(() => {
    });
}

function setPlayheadToOutMarker() {
    console.debug("set Playhead to OUT Marker", activeMarker.id);
    let outTimeStamp = activeMarker.getTimeObservation().end;
    omakasePlayer.video.seekToTimestamp(outTimeStamp).subscribe(() => {
    });
}

function addMarker() {
    console.debug("Adding marker at frame", omakasePlayer.video.getCurrentFrame());
    if (markerId > 8) return;
    let markerLane = omakasePlayer.timeline.getLane('marker_lane_inout_1');
    let color = markerColors[markerId];
    let periodMarker = markerLane.addMarker(new omakase.PeriodMarker({
        id: "periodMarker" + markerId,
        observation: {
            start: omakasePlayer.video.getCurrentTime(),
            end: omakasePlayer.video.getCurrentTime() + 20
        },
        style: {
            symbolType: 'triangle',
            color: color,
            renderType: 'spanning'
        }
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
    markerImage.src = omakasePlayer.timeline.getLane('thumbnail_lane_default').getThumbnailVttFile().findCues(omakasePlayer.video.getCurrentTime(), omakasePlayer.video.getCurrentTime() + 20)[0].url;
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
    spanStartValue.innerHTML = omakasePlayer.video.formatTimestamp(omakasePlayer.video.getCurrentTime());
    spanEndValue.innerHTML = omakasePlayer.video.formatTimestamp(omakasePlayer.video.getCurrentTime() + 20);

    periodMarker.onChange$.subscribe((event) => {
        spanStartValue.innerHTML = omakasePlayer.video.formatTimestamp(event.timeObservation.start);
        spanEndValue.innerHTML = omakasePlayer.video.formatTimestamp(event.timeObservation.end);
        markerImage.src = markerImage.src = omakasePlayer.timeline.getLane('thumbnail_lane_default').getThumbnailVttFile().findCues(event.timeObservation.start, event.timeObservation.start + 20)[0].url;
    });

    marker.onclick = function () {
        toggleMarkers(marker);
    };

    if (markerId > 8) {
        document.getElementById('addMarker').remove();
    }
}

document.getElementById('addMarker').onclick = addMarker;
let initialMarker = document.getElementById('marker1');
initialMarker.onclick = function () {
    toggleMarkers(initialMarker);
};


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
    omakasePlayer.subtitles.hideTrack(activeCaptionIndex);
    if (activeCaptionIndex === captions.length - 1) {
        currentCaption = captions[0];
        omakasePlayer.subtitles.showTrack(String(0));
    } else {
        currentCaption = captions[activeCaptionIndex + 1];
        omakasePlayer.subtitles.showTrack(String(activeCaptionIndex + 1));
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