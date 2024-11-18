export declare function calculateLPFCoefficients(numCoefficients: number, upsampleFactor: number): number[];
export declare function filterSample(lpfBuffer: number[], lpfCoefficients: number[], upsampleFactor: number): number[];
export declare function truePeakValues(input: Float32Array[], lpfBuffers: number[][], lpfCoefficients: number[], upsampleFactor: number): number[];
