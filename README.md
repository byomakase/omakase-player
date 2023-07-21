# Omakase Player #

## Player Initialization and Usage

### Player initialization

Omakase player requires hls.js library. Include hls.js library with Omakase Player

```
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
```

Include Omakase Player js library
```
<script src="dist/omakase-player.umd.js"></script>
```

Alternatively, you can include Omakase Player by getting it from npm:

```
npm i @byomakase/omakase-player
```

Create a div with id=omakase-player as placeholder for the player

```
<div id="omakase-player"></div>
```

Initialize the player with following code. Use appropriate font family to match desired page font.

```
let omakasePlayer = new omakase.OmakasePlayer({
        videoHTMLElementId: 'omakase-player',
        fontFamily: 'Arial'
    })
```

Player supports default overlay showing Play, Pause and Processing icon. This overlay requires styling. Sample styling definition is provided in omakase-player/player.css with referenced icons in omakase-player/images

Once player is initialized we can load hls video stream with following code

```
omakasePlayer.loadVideo('https://my-server.com/myvideo.m3u8', 25).subscribe()
```

Within observable, we can initialize dependant logic, as a subscription to various events, load caption tracks etc.

```
omakasePlayer.loadVideo('https://my-server.com/myvideo.m3u8', 25).subscribe(
    video => {

        omakasePlayer.video.onVideoTimeChange$.subscribe((event) => {
            //Get current frame
            console.log(event.frame)
            
            //Get current time
            console.log(event.currentTime)
            
            //Format current time to 
            console.log(omakasePlayer.video.formatTimestamp(event.currentTime))
        })

        omakasePlayer.video.onSeeked$.subscribe(event => {
            // console.log('omakasePlayer.video.onSeeked$', event)
        })

        omakasePlayer.video.onAudioSwitched$.subscribe(event => {
            // console.log('omakasePlayer.video.onAudioSwitched$', event)
        })

        let daDkSubtitles$ = omakasePlayer.subtitles.createVttTrack({
            id: 'da-dk-1', 
            src: 'https://my-server.com/mysub1.vtt', 
            label: 'Dutch', 
            language: 'da-dk', 
            default: true
        })

        let hrHrSubtitles$ = omakasePlayer.subtitles.createVttTrack({
            id: 'hr-hr-1', 
            src: 'https://my-server.com/mysub2.vtt',
            label: 'Hrvatski', 
            language: 'hr-hr'
        })

        omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_SUBTITLES_SHOW, (event) => {
            console.log('Subtitles on', event)
        })

        omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_SUBTITLES_HIDE, (event) => {
            console.log('Subtitles off', event)
        })
    })
```

If required, hls.js instance and video html element can be fetched through Player API

```
let videoHtmlElement = omakasePlayer.video.getHTMLVideoElement()

let hlsInstance = omakasePlayer.video.getHls()
hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('Hls event MANIFEST_PARSED', data)
    })
```

Player CSS styling should be placed in following class

```
.omakase-player-wrapper .omakase-video {
    width: 500px;
}
```

### Timeline initialization

Timeline will be inserted in following div

```
<div id="omakase-timeline"></div>
```

Omakase Player will initialize timeline with createTimeline method. Next sample is loading video thumbnails sequence and adding custom styling to timeline

```
omakasePlayer.createTimeline({
        thumbnailVttUrl: 'https://my-server.com/mythumb.vtt',
        style:
        {
            stageMinWidth: 700,
            backgroundFill: '#E4E5E5',
            headerBackgroundFill: '#EDEFEE',
            footerBackgroundFill: '#EDEFEE',

            playProgressBarHeight: 12,
            scrollbarHeight: 15,

            thumbnailHoverWidth: 200,
            thumbnailHoverStroke: 'rgba(255,73,145,0.9)',
            thumbnailHoverStrokeWidth: 5,
            thumbnailHoverYOffset: 0,

            headerHeight: 50,
            footerHeight: 40,
            leftPanelWidth: 200,
            rightPanelLeftGutterWidth: 30,
            rightPanelRightGutterWidth: 30,
            timecodedContainerClipPadding: 20
        }
}).subscribe()
```

Timeline is supporting various timeline rows as:

* Markers
* Subtitle visualization
* Audio visualization
* Thumbnail visualization

Following example is initializing each of these:

```
omakasePlayer.createTimeline({
        thumbnailVttUrl: 'https://my-server.com/mythumb.vtt'
}).subscribe(timeline =>{
        //Creating Marker Lane
        let inAndOutMarkersLane = new omakase.MarkerLane({
            id: 'marker_lane_inout_1', description: 'In and out markers',
            style: {
                backgroundFill: '#E9F7FF',
                height: 30,
                leftBackgroundFill: '#E4E5E5',
            }
        })

        timeline.addLane(inAndOutMarkersLane)

        //Adding sample Range marker to Marker Lane
        let periodMarker1 = inAndOutMarkersLane.addMarker(new omakase.PeriodMarker({
            id: 'periodMarker1',
            observation: {
                start: 0,
                end: 0
            },
            style: {
                symbolType: 'triangle',
                color: '#CD5600',
                renderType: 'lane'
            }
        }))

        //Adding Thumbnal Lane to timeline
        let defaultThumbnailLane = new omakase.ThumbnailLane({
            id: 'thumbnail_lane_default', 
            description: 'Thumbnails', 
            thumbnailVttUrl: 'https://my-server.com/mythumb.vtt',
            style: {
                backgroundFill: '#E9F7FF',
                height: 60,
                leftBackgroundFill: '#E4E5E5'
            }
        })

        timeline.addLane(defaultThumbnailLane)

        //Enable automatic position to thumb start frame when clicked on thumbnail
        defaultThumbnailLane.onClick$.subscribe((event) => {
            omakasePlayer.video.seekToTimestamp(
                event.thumbnail.getThumbnailVttCue().startTime).subscribe()
        })

        //Adding subtitle visualization Lane to timeline
        let subtitlesLane1 = new omakase.SubtitlesLane({
            id: 'subtitles_lane_1',
            description: 'Subtitle DK',
            subtitlesVttUrl: 'https://my-server.com/mysub.vtt',
            style: {
                backgroundFill: "#E9F7FF",
                height: 25,
                leftBackgroundFill: '#E4E5E5',
                subtitlesLaneItemOpacity: 0.7,
                subtitlesLaneItemFill: '#87D798'
            }
        })

        timeline.addLane(subtitlesLane1)

})
```

## Development

Player build & build watch

```
npm install ci

./dev.sh
```

## Production build

```
npm install ci
npm run prod
```

Production artefacts that need to be published to NPM are created in `/dist` folder

## Known limitations
 - Firefox browser is not supported as it doesn't support ```requestVideoFrameCallback``` function