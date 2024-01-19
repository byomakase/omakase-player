import {OmakaseChartFile, OgChart, OgChartCue} from '../types';

export class BarChartFile implements OmakaseChartFile<OgChart> {
  protected chart: OgChart;
  protected cues: Map<number, OgChartCue> = new Map<number, OgChartCue>();
  protected cuesKeysSorted: number[] = [];

  constructor(chart: OgChart) {
    this.chart = chart;

    this.chart.cues.forEach(cue => {
      this.cues.set(cue.startTime, cue);
      this.cuesKeysSorted.push(cue.startTime);
    })

    this.cuesKeysSorted.sort((a, b) => {
      return a - b;
    });
  }

  hasCues() {
    return this.cues && this.cues.size > 0;
  }

  findCue(time: number): OgChartCue {
    let cues = this.findCues(time, time);
    if (cues && cues.length === 1) {
      return cues[0];
    } else {
      return void 0;
    }
  }

  findCues(startTime: number, endTime: number): OgChartCue[] {
    let startIndex = this.findCueIndex(startTime);
    let endIndex = this.findCueIndex(endTime);
    if (endIndex === -1) {
      return [];
    }
    return this.cuesKeysSorted.slice(startIndex, endIndex + 1)
      .map(startTime => this.cues.get(startTime));
  }

  getCues(): OgChartCue[] {
    return [...this.cues.values()];
  }

  protected findCueIndex(time: number): number {
    let startIndex = 0;
    let endIndex = this.cuesKeysSorted.length - 1;
    while (startIndex <= endIndex) {
      const mid = Math.floor((startIndex + endIndex) / 2);
      if (this.cuesKeysSorted[mid] === time) {
        return mid;
      } else if (this.cuesKeysSorted[mid] < time) {
        startIndex = mid + 1;
      } else {
        endIndex = mid - 1;
      }
    }
    if (endIndex === -1) {
      endIndex = 0;
    }
    return endIndex;
  }
}
