/**
 * analysis.js — offline FFT analysis of the decoded AudioBuffer.
 *
 * The live visualizer reads a realtime AnalyserNode, which can only ever be
 * sampled at wall-clock speed. A deterministic video export has to evaluate the
 * visualizer at arbitrary timestamps, so the export range is analysed up front
 * into a per-frame band timeline that the export loop samples by playhead time.
 *
 * The Blackman window, the linear-magnitude smoothing and the -100..-30 dB byte
 * mapping below reproduce AnalyserNode.getByteFrequencyData(), and the band
 * averaging reproduces getBandLevel() in main.js, so a frame rendered offline
 * matches the same moment in the live preview.
 */

const MIN_DECIBELS = -100;
const MAX_DECIBELS = -30;

function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function nextEventLoopTurn() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFftWorkspace(size) {
    const levels = Math.log2(size);
    if (!Number.isInteger(levels)) throw new Error('FFT size must be a power of two.');

    const real = new Float32Array(size);
    const imaginary = new Float32Array(size);
    const bitReversedIndices = new Uint32Array(size);
    const windowValues = new Float32Array(size);

    for (let index = 0; index < size; index += 1) {
        let value = index;
        let reversed = 0;
        for (let bit = 0; bit < levels; bit += 1) {
            reversed = (reversed << 1) | (value & 1);
            value >>= 1;
        }
        bitReversedIndices[index] = reversed;
        // Blackman window, matching the Web Audio AnalyserNode.
        windowValues[index] =
            0.42 -
            0.5 * Math.cos((2 * Math.PI * index) / (size - 1)) +
            0.08 * Math.cos((4 * Math.PI * index) / (size - 1));
    }

    const stages = [];
    for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
        const halfBlock = blockSize / 2;
        const phaseStep = (-2 * Math.PI) / blockSize;
        const cosine = new Float32Array(halfBlock);
        const sine = new Float32Array(halfBlock);
        for (let offset = 0; offset < halfBlock; offset += 1) {
            const angle = phaseStep * offset;
            cosine[offset] = Math.cos(angle);
            sine[offset] = Math.sin(angle);
        }
        stages.push({ blockSize, halfBlock, cosine, sine });
    }

    return { size, real, imaginary, bitReversedIndices, windowValues, stages };
}

function fillFftInput(workspace, channels, channelScale, frameStart) {
    const { size, real, imaginary, bitReversedIndices, windowValues } = workspace;
    const sampleCount = channels[0].length;

    for (let offset = 0; offset < size; offset += 1) {
        const sourceIndex = frameStart + offset;
        let sample = 0;
        if (sourceIndex >= 0 && sourceIndex < sampleCount) {
            for (let channel = 0; channel < channels.length; channel += 1) {
                sample += channels[channel][sourceIndex] * channelScale;
            }
        }
        const destination = bitReversedIndices[offset];
        real[destination] = sample * windowValues[offset];
        imaginary[destination] = 0;
    }
}

function runFft(workspace) {
    const { size, real, imaginary, stages } = workspace;

    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
        const { blockSize, halfBlock, cosine, sine } = stages[stageIndex];
        for (let blockStart = 0; blockStart < size; blockStart += blockSize) {
            for (let offset = 0; offset < halfBlock; offset += 1) {
                const evenIndex = blockStart + offset;
                const oddIndex = evenIndex + halfBlock;
                const oddReal = real[oddIndex] * cosine[offset] - imaginary[oddIndex] * sine[offset];
                const oddImaginary = real[oddIndex] * sine[offset] + imaginary[oddIndex] * cosine[offset];
                const evenReal = real[evenIndex];
                const evenImaginary = imaginary[evenIndex];

                real[oddIndex] = evenReal - oddReal;
                imaginary[oddIndex] = evenImaginary - oddImaginary;
                real[evenIndex] = evenReal + oddReal;
                imaginary[evenIndex] = evenImaginary + oddImaginary;
            }
        }
    }
}

/**
 * Mirrors getBandLevel() in main.js: floor/ceil bin edges against the Nyquist
 * frequency, inclusive of the last bin, averaged over the byte-domain values.
 */
function bandBinRange(minHz, maxHz, nyquist, binCount) {
    const firstBin = Math.max(0, Math.floor((minHz / nyquist) * binCount));
    const lastBin = Math.min(binCount - 1, Math.ceil((maxHz / nyquist) * binCount));
    return { firstBin, lastBin };
}

/**
 * Analyse a time range of the decoded buffer into a per-frame band timeline.
 *
 * `bands` is an array of { min, max } Hz pairs. Frames are produced at exactly
 * `fps`, so export frame N corresponds to analysis frame N with no resampling.
 */
export async function analyzeAudioRange(audioBuffer, options, onProgress = () => {}) {
    const {
        fftSize = 1024,
        smoothing = 0.78,
        bands = [],
        fps = 60,
        startSeconds = 0,
        endSeconds = audioBuffer.duration,
        warmupSeconds = 1.0,
    } = options;

    const sampleRate = audioBuffer.sampleRate;
    const nyquist = sampleRate / 2;
    const binCount = fftSize / 2;
    const duration = Math.max(0, endSeconds - startSeconds);
    const frameCount = Math.max(1, Math.ceil(duration * fps));

    const workspace = createFftWorkspace(fftSize);
    const channels = [];
    for (let index = 0; index < audioBuffer.numberOfChannels; index += 1) {
        channels.push(audioBuffer.getChannelData(index));
    }
    const channelScale = 1 / Math.max(1, channels.length);

    const bandRanges = bands.map((band) =>
        bandBinRange(Math.min(band.min, band.max), Math.max(band.min, band.max), nyquist, binCount)
    );
    const bandTimelines = bands.map(() => new Float32Array(frameCount));

    const smoothed = new Float32Array(binCount);
    const normalized = new Float32Array(binCount);
    const decibelRange = MAX_DECIBELS - MIN_DECIBELS;
    const smoothingFactor = clampValue(smoothing, 0, 0.95);
    const hop = sampleRate / fps;
    const startFrameOffset = startSeconds * sampleRate;

    // Run the smoothing filter in before the first emitted frame so the export
    // does not open on a spectrum ramping up from silence.
    const warmupFrames = Math.max(0, Math.round(warmupSeconds * fps));
    let lastYield = performance.now();

    for (let frameIndex = -warmupFrames; frameIndex < frameCount; frameIndex += 1) {
        const centerSample = Math.round(startFrameOffset + frameIndex * hop);
        fillFftInput(workspace, channels, channelScale, centerSample - Math.floor(fftSize / 2));
        runFft(workspace);

        const { real, imaginary } = workspace;
        for (let bin = 0; bin < binCount; bin += 1) {
            const magnitude =
                Math.sqrt(real[bin] * real[bin] + imaginary[bin] * imaginary[bin]) / fftSize;
            smoothed[bin] = smoothingFactor * smoothed[bin] + (1 - smoothingFactor) * magnitude;

            const decibels = 20 * Math.log10(Math.max(smoothed[bin], 1e-12));
            normalized[bin] = clampValue(((decibels - MIN_DECIBELS) / decibelRange) * 255, 0, 255) / 255;
        }

        if (frameIndex >= 0) {
            for (let bandIndex = 0; bandIndex < bandRanges.length; bandIndex += 1) {
                const { firstBin, lastBin } = bandRanges[bandIndex];
                if (lastBin < firstBin) {
                    bandTimelines[bandIndex][frameIndex] = 0;
                    continue;
                }
                let total = 0;
                for (let bin = firstBin; bin <= lastBin; bin += 1) total += normalized[bin];
                bandTimelines[bandIndex][frameIndex] = total / (lastBin - firstBin + 1);
            }
        }

        const now = performance.now();
        if (now - lastYield > 60) {
            lastYield = now;
            onProgress(Math.max(0, frameIndex + 1) / frameCount);
            await nextEventLoopTurn();
        }
    }

    onProgress(1);
    return { fps, frameCount, bands: bandTimelines, duration, startSeconds };
}

/** Read the analysed band values at an absolute playhead time. */
export function sampleBandsAtTime(analysis, seconds) {
    if (!analysis) return null;
    const frameIndex = clampValue(
        Math.round((seconds - analysis.startSeconds) * analysis.fps),
        0,
        analysis.frameCount - 1
    );
    return analysis.bands.map((timeline) => timeline[frameIndex]);
}
