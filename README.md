# Omakase Player

## Prerequisites

Omakase Player can be loaded as UMD module inside HTML page. If loaded as UMD module it requires hls.js loaded before Omakase Player:

```html

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script src="https://cdn.jsdelivr.net/npm/@byomakase/omakase-player@0.9.2-SNAPSHOT.1724678052/dist/omakase-player.umd.min.js"></script>
```

Omakase Player can be used as ES module and CJS module as well.

If used with modern Typescript / Javascript frameworks (such as Angular, React or Vue), it is recommended to simply install Omakase Player as dependency into `package.json`:

```bash
npm install @byomakase/omakase-player
```

Optionally, you can include default Omakase Player CSS stylesheet or import and use  `omakase-player.scss` SCSS stylesheet.

```html

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@byomakase/omakase-player@0.9.2-SNAPSHOT.1724678052/dist/style.min.css">
```

Stylesheet references default player overlay icons, help menu icons and default styles for video safe zones. All of which can be overridden.

## Player Initialization

Omakase Player requires div as a placeholder for HTML5 player.

```html

<div id="omakase-player"></div>
```

Initialize the player by providing div id in player configuration. If used as UMD module, Omakase Player objects are available in global `omakase` namespace:

```javascript
// Create new OmakasePlayer instance
let omakasePlayer = new omakase.OmakasePlayer({
  playerHTMLElementId: 'omakase-player',
});
```

Once player is initialized we can load hls video stream by providing stream URL and stream frame rate:

```javascript
omakasePlayer.loadVideo('https://my-server.com/myvideo.m3u8', 25).subscribe({ // 25 - frame rate
  next: (video) => {
    console.log(`Video loaded. Duration: ${video.duration}, totalFrames: ${video.totalFrames}`)
  }
})
```

## Video API

Complete list of Video API methods is available in API Reference Docs

### Video playback control

Video playback control is achieved through Video API.

```javascript
// plays video
omakasePlayer.video.play();

// pauses video
omakasePlayer.video.pause();

// seeks to timestamp
omakasePlayer.video.seekToTime(123.45).subscribe({
  next: (result) => {
    if (result) {
      console.log(`Seek to timestamp success`);
    }
  }
})

// seeks to frame
omakasePlayer.video.seekToFrame(123).subscribe({
  next: (result) => {
    if (result) {
      console.log(`Seek to frame success`);
    }
  }
})

// toggles mute / unmute
omakasePlayer.video.toggleMuteUnmute();
```

### Events

Before or after loading video stream, we can subscribe to various events. All events are available in API objects as Observables or we can subscribe to events by using *EventEmmiter* like methods.
Example how to subscribe to video loaded event Observable:

```javascript
// Subscribe to Observable
omakasePlayer.video.onVideoLoaded$.subscribe({
  next: (event) => {
    if (event) {
      let video = event.video;
      console.log(`Video loaded. Duration: ${video.duration}, totalFrames: ${video.totalFrames}`)
    }
  }
})
```

Example how to subscribe to video time change event using *EventEmmiter* like methods:

```javascript
// alternatively, subscribe to events by using 'EventEmmiter' methods
omakasePlayer.on(omakasePlayer.EVENTS.OMAKASE_VIDEO_TIME_CHANGE, (event) => {
  console.log(`Video time change. Timestamp: ${event.currentTime} => ${omakasePlayer.video.formatToTimecode(event.currentTime)}. Frame: ${event.frame}`)
})
```

Video playback events subscription examples:

```javascript
omakasePlayer.video.onPlay$.subscribe({
  next: (event) => {
    console.log(`Video play. Timestamp: ${event.currentTime} => ${omakasePlayer.video.formatToTimecode(event.currentTime)}`)
  }
})

omakasePlayer.video.onPause$.subscribe({
  next: (event) => {
    console.log(`Video pause. Timestamp: ${event.currentTime} => ${omakasePlayer.video.formatToTimecode(event.currentTime)}`)
  }
})

omakasePlayer.video.onSeeked$.subscribe({
  next: (event) => {
    console.log(`Video seeked. Timestamp: ${event.currentTime} => ${omakasePlayer.video.formatToTimecode(event.currentTime)}`)
  }
})

omakasePlayer.video.onVideoTimeChange$.subscribe({
  next: (event) => {
    console.log(`Video time change. Timestamp: ${event.currentTime} => ${omakasePlayer.video.formatToTimecode(event.currentTime)}. Frame: ${event.frame}`)
  }
})
```

### Hls.js

We can fetch hls.js instance through API, as well as subscribe to hls.js events:

```javascript
// Get hls.js instance and hook onto hls.js events
let hlsInstance = omakasePlayer.video.getHls();
hlsInstance.on('hlsManifestParsed', (event, data) => {
  console.log(`HLS manifest parsed`, data);
})
```

### Utilities

```javascript
// adds safe zone 10% from all player edges
omakasePlayer.video.addSafeZone({
  topRightBottomLeftPercent: [10, 10, 10, 10]
})

// adds safe zone calculated from provided aspect ratio expression
omakasePlayer.video.addSafeZoneWithAspectRatio({
  aspectRatioText: "16/9"
})

// toggles fullscreen
omakasePlayer.video.toggleFullscreen();
```

## Audio API

Complete list of Audio API methods is available in API Reference Docs.

Few common usages of Audio API:

```javascript
// retrieves all available audio tracks
let audioTracks = omakasePlayer.audio.getAudioTracks();

// retrieves active audio track
let activeAudioTrack = omakasePlayer.audio.getCurrentAudioTrack();

// detect audio tracks switching
omakasePlayer.audio.onAudioSwitched$.subscribe({
  next: (event) => {
    console.log(`Audio switched`, event)
  }
})

// sets audio track with id=0 as active audio track
omakasePlayer.audio.setAudioTrack(0);

```

## Timeline

Timeline is initialized by defining div placeholder and calling `createTimeline()` API method with optional configuration and style settings.

```html

<div id="omakase-timeline"></div>
```

```javascript
omakasePlayer.createTimeline({
  // html timeline div id
  timelineHTMLElementId: 'omakase-timeline',
  // thumbnails can be loaded from VTT file and shown in Timeline Scrubber Lane on mouse hover
  thumbnailVttUrl: 'https://my-server.com/thumbnails/timeline.vtt',
  style: {
    stageMinHeight: 300,
    backgroundFill: '#fef9f7'
    // ...see API Reference Docks for all other available style properties
  }
}).subscribe({
  next: (timelineApi) => {
    console.log(`Timeline loaded`)
  }
})
```

## Timeline Lanes

Omakase Player supports adding various Timeline Lanes:

- Scrubber Lane
- Thumbnail Lane
- Marker Lane
- Subtitles Lane
- Audio Track Lane
- Label Lane
- Scrollbar Lane
- Line Chart Lane
- Bar Chart Lane
- Og Chart Lane

Timeline Lanes are added after Timeline creation. Base Timeline Lanes can be configured, styled and extended with custom functionalities.

### Scrubber Lane

Scrubber Lane is created automatically. Scrubber Lane instance can be fetched by using Timeline API after Timeline is created

```javascript
omakasePlayer.createTimeline().subscribe({
  next: (timelineApi) => {
    console.log(`Timeline loaded`);

    let scrubberLane = omakasePlayer.timeline.getScrubberLane();
    // set custom styles for Scrubber Lane
    scrubberLane.style = {
      backgroundFill: '#dfe0e2',
      tickFill: '#08327d',
      timecodeFill: '#08327d'
      // ...see API Reference Docks for all other available style properties
    }

  }
})
```

### Thumbnail Lane

Thumbnail Lane loads thumbnails from VTT file and shows them on timeline. In example below thumbnail mouse click event is handled.

```javascript
let thumbnailLane = new omakase.ThumbnailLane({
  description: 'Thumbnails',
  vttUrl: 'https://my-server.com/thumbnails.vtt'
})
omakasePlayer.timeline.addTimelineLane(thumbnailLane);

// Handle thumbnail click event
thumbnailLane.onClick$.subscribe({
  next: (event) => {
    if (event.thumbnail.cue) {
      console.log(`Seeking to to thumbnail: ${omakasePlayer.video.formatToTimecode(event.thumbnail.cue.startTime)}`);
      omakasePlayer.video.seekToTime(event.thumbnail.cue.startTime).subscribe({
        next: () => {
          console.log(`Seek complete`);
        }
      })
    }
  }
})
```

### Marker Lane

Marker Lane can be populated from VTT file or by using API methods directly:

```javascript
// marker lane
let markerLane = new omakase.MarkerLane({
  description: 'Markers',
  vttUrl: 'https://demo.player.byomakase.org/data/thumbnails/timeline.vtt', // https://my-server.com/thumbnails/timeline.vtt
  markerCreateFn: (cue, index) => {
    return new omakase.PeriodMarker({
      timeObservation: {
        start: cue.startTime,
        end: cue.endTime
      },
      text: `${cue.text}`,
      editable: true,
      style: {
        renderType: 'lane',
        color: index % 2 ? '#2677bb' : '#dd6464',
        symbolType: 'triangle'
      }
    })
  },
  markerProcessFn: (marker, index) => {
    marker.onClick$.subscribe({
      next: (event) => {
        console.log(`Clicked on marker with text: `, marker.text)
      }
    })

    marker.onChange$.subscribe({
      next: (event) => {
        console.log(`Marker time observation change: `, event)
      }
    })
  }
})
omakasePlayer.timeline.addTimelineLane(markerLane);

// manually adding markers through API
markerLane.addMarker(new omakase.MomentMarker({
  timeObservation: {
    time: 100
  },
  style: {
    renderType: 'spanning',
    color: '#ff0000',
    symbolType: 'circle'
  }
}));
```

### Subtitles Lane

Subtitles Lane is used for subtitles visualisation on timeline. It is populated from VTT file.

```javascript
let subtitlesLane = new omakase.SubtitlesLane({
  description: 'Subtitles',
  vttUrl: 'https://my-server.com/subtitles.vtt'
})
omakasePlayer.timeline.addTimelineLane(subtitlesLane);
```

### Audio Track Lane

Audio Track Lane is used for audio track visualisation.

```javascript
let audioTrackLane = new omakase.AudioTrackLane({
  description: 'Audio Track',
  vttUrl: 'https://my-server.com/audio-track.vtt'
})
omakasePlayer.timeline.addTimelineLane(audioTrackLane);
```

### Label Lane

Label Lane is usually used on timeline as grouping lane that contains other timeline components, such as timeline buttons and labels.

```javascript
let labelLane = new omakase.LabelLane({
  description: 'Label lane', // appears in left pane
  text: 'Right pane label', // appears in right pane
  style: {
    backgroundFill: '#a5a6a9',
    textFill: '#f45844',
    textFontSize: 20
  }
});
omakasePlayer.timeline.addTimelineLane(labelLane);
```

### Scrollbar Lane

Scrollbar Lane contains Timeline scrollbar that controls timeline zoom and scroll.

```javascript
// scrollbar lane
let scrollbarLane = new omakase.ScrollbarLane({
  description: ''
});
omakasePlayer.timeline.addTimelineLane(scrollbarLane);
```

### Line Chart Lane

Line Chart Lane for data visualisation.

```javascript
let lineChartLane = new omakase.LineChartLane({
  vttUrl: 'https://my-server.com/line-chart.vtt',
  yMax: 100, // optional custom max value, if not provided it will be resolved from data
  yMin: -50, // optional custom min value, if not provided it will be resolved from data
  style: {
    pointWidth: 5,
    lineStrokeWidth: 2
  },
});
omakasePlayer.timeline.addTimelineLane(lineChartLane);
```

### Bar Chart Lane

Bar Chart Lane for data visualisation.

```javascript
let barChartLane = new omakase.BarChartLane({
  vttUrl: 'https://my-server.com/bar-chart.vtt',
  description: 'Bar Chart',
  valueMax: 120,  // optional custom max value, if not provided it will be resolved from data
  valueMin: 50,   // optional custom min value, if not provided it will be resolved from data
  valueTransformFn: (value) => {
    // each value can be transformed in this hook function
    return value;
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
omakasePlayer.timeline.addTimelineLane(barChartLane);
```

### OG Chart Lane

OG Chart Lane for data visualisation.

```javascript
let ogChartLane = new omakase.OgChartLane({
  vttUrl: 'https://my-server.com/og-chart.vtt',
  description: 'Bar Chart',
  valueMax: 120,  // optional custom max value, if not provided it will be resolved from data
  valueMin: 50,   // optional custom min value, if not provided it will be resolved from data
  valueTransformFn: (value) => {
    // each value can be transformed in this hook function
    return value;
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
omakasePlayer.timeline.addTimelineLane(ogChartLane);
```

## Timeline Lane API

### Timeline Lane Nodes

Timeline Lane Nodes can be added to Timeline Lane instances with `addTimelineNode()` API method. Nodes types that can be added are:

- Image button
- Text label

In this example, Timeline zoom in and zoom out buttons are added to Scrubber Lane:

```javascript
let scrubberLane = omakasePlayer.timeline.getScrubberLane();

// define zoom in button
let zoomInButton = new omakase.ImageButton({
  src: `https://my-server.com/images/plus-circle.svg`,
  width: 30,
  height: 30,
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
  src: `https://my-server.com/images/minus-circle.svg`,
  width: 30,
  height: 30,
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
    timelineNode: button,
  })
});
```

### Minimize, Maximize

Timeline Lane in Timeline can be minimized or maximized by calling methods from `TimelineLaneApi`.  
In this example, Grouping Label Lane is created at specific index on Timeline. *Minimize* and *Maximize* Text Label action buttons are created and added to Timeline Lane left pane.

```javascript
// marker lane group
let markerLaneGroup = new omakase.LabelLane({
  text: 'Marker Lane Group', // appears in right pane
  style: {
    backgroundFill: '#c2b4a6',
    textFill: '#fbfbfb'
  }
});

// add grouping lane before MarkerLane
omakasePlayer.timeline.addTimelineLaneAtIndex(markerLaneGroup, omakasePlayer.timeline.getTimelineLanes().findIndex(p => p.id === markerLane.id));

// minimize text label
let textLabelMinimize = new omakase.TextLabel({
  text: `Minimize`,
  listening: true,
  style: {
    align: 'center',
    verticalAlign: 'middle',
    fill: '#ffffff',
    backgroundFill: '#f45844',
    backgroundBorderRadius: 3
  }
});

// maximize text label
let textLabelMaximize = new omakase.TextLabel({
  text: `Maximize`,
  listening: true,
  style: {
    align: 'center',
    verticalAlign: 'middle',
    fill: '#ffffff',
    backgroundFill: '#46454b',
    backgroundBorderRadius: 3
  }
});

// minimize lane on click
textLabelMinimize.onClick$.subscribe({
  next: () => {
    if (!markerLane.isMinimized()) {
      markerLane.minimizeEased().subscribe()
    }
  }
})

// maximize lane on click
textLabelMaximize.onClick$.subscribe({
  next: () => {
    if (markerLane.isMinimized()) {
      markerLane.maximizeEased().subscribe()
    }
  }
});

// add text labels to grouping lane left pane
[textLabelMinimize, textLabelMaximize].forEach(textLabel => {
  markerLaneGroup.addTimelineNode({
    width: 60,
    height: 22,
    justify: 'start',
    margin: [0, 5, 0, 0],
    timelineNode: textLabel
  });
})
```

## Subtitles API

Complete list of Audio API methods is available in API Reference Docs.

Omakase Player automatically identifies all available subtitles VTT tracks from stream manifest and makes them available through Subtitles API.

```javascript
omakasePlayer.subtitles.onSubtitlesLoaded$.subscribe({
  next: (event) => {
    // retrieves all subtitles VTT tracks
    let subtitlesVttTracks = omakasePlayer.subtitles.getTracks();

    // shows first available VTT track
    omakasePlayer.subtitles.showTrack(subtitlesVttTracks[0].id)
  }
})
```

Subtitles can be imported from external VTT file:

```javascript
// import subtitles from VTT file
omakasePlayer.subtitles.createVttTrack({
  id: '0',
  src: 'https://my-server.com/subtitles.vtt',
  label: 'English (US)',
  language: 'en-us',
  default: true
}).subscribe({
  next: (subtitlesVttTrack) => {
    console.log(`Subtitles successfully created`)
  }
})
```

## Development

Player build & build watch

```bash
npm install ci
npm run dev
```

## Production build

```bash
npm install ci
npm run prod
```

Production artefacts that need to be published to NPM are created in `/dist` folder

## Known limitations

- Firefox browser is not supported as it doesn't support ```requestVideoFrameCallback``` function
