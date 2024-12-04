declare class OmpDetachedPlayerProcessor extends AudioWorkletProcessor {
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare const ompSyncWatchdogProcessorName = "omp-sync-watchdog-processor";
