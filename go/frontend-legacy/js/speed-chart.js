const WINDOW_MS = 60_000;
const MAX_SAMPLES = 120;
const chartState = new WeakMap();

const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
            const state = chartState.get(entry.target);
            if (state) drawSpeedHistory(entry.target, state.samples, state.status);
        }
    })
    : null;

export function appendSpeedSample(samples, speed, timestamp = Date.now()) {
    const numericSpeed = Number(speed);
    if (!Number.isFinite(numericSpeed) || numericSpeed < 0) return samples;
    const cutoff = timestamp - WINDOW_MS;
    while (samples.length && samples[0].timestamp < cutoff) samples.shift();
    const previous = samples.at(-1);
    if (previous && timestamp - previous.timestamp < 250) {
        previous.speed = numericSpeed;
        previous.timestamp = timestamp;
    } else {
        samples.push({ timestamp, speed: numericSpeed });
    }
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    return samples;
}

function chartColors(status) {
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--primary-green').trim() || '#00ff99';
    const line = ['failed', 'cancelled'].includes(status) ? '#ef4444' : accent;
    const grid = document.documentElement.classList.contains('dark') ? 'rgba(148,163,184,.16)' : 'rgba(71,85,105,.16)';
    return { line, grid };
}

export function drawSpeedHistory(canvas, samples, status = 'waiting') {
    if (!canvas) return;
    const width = Math.max(1, Math.round(canvas.clientWidth || 280));
    const height = Math.max(1, Math.round(canvas.clientHeight || 52));
    const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
    const renderWidth = Math.round(width * pixelRatio);
    const renderHeight = Math.round(height * pixelRatio);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
    }

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const { line, grid } = chartColors(status);
    const padding = 3;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    context.strokeStyle = grid;
    context.lineWidth = 1;
    for (const ratio of [0.25, 0.5, 0.75]) {
        const y = padding + plotHeight * ratio;
        context.beginPath();
        context.moveTo(padding, y);
        context.lineTo(width - padding, y);
        context.stroke();
    }
    if (!samples.length) return;

    const latestTime = samples.at(-1).timestamp;
    const earliestTime = Math.min(samples[0].timestamp, latestTime - 1000);
    const timeSpan = Math.max(1000, latestTime - earliestTime);
    const maxSpeed = Math.max(1, ...samples.map((sample) => sample.speed));
    const points = samples.map((sample) => ({
        x: padding + ((sample.timestamp - earliestTime) / timeSpan) * plotWidth,
        y: height - padding - (sample.speed / maxSpeed) * plotHeight,
    }));

    const gradient = context.createLinearGradient(0, padding, 0, height);
    gradient.addColorStop(0, `${line}48`);
    gradient.addColorStop(1, `${line}00`);
    context.beginPath();
    context.moveTo(points[0].x, height - padding);
    for (const point of points) context.lineTo(point.x, point.y);
    context.lineTo(points.at(-1).x, height - padding);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
    context.strokeStyle = line;
    context.lineWidth = 1.8;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();
}

export function updateSpeedChart(canvas, samples, { speed = 0, status = 'waiting', summaryElement, peakElement } = {}) {
    if (!canvas || !Array.isArray(samples)) return;
    const shouldSample = ['downloading', 'processing', 'completed', 'failed', 'cancelled'].includes(status);
    if (shouldSample) appendSpeedSample(samples, Number(speed) || 0);
    chartState.set(canvas, { samples, status });
    resizeObserver?.observe(canvas);
    drawSpeedHistory(canvas, samples, status);

    const peak = samples.length ? Math.max(...samples.map((sample) => sample.speed)) : 0;
    if (peakElement) peakElement.textContent = peak > 0 ? `Peak: ${formatCompactBytes(peak)}/s` : 'Peak: --';
    if (summaryElement) {
        const current = Number(speed) || 0;
        summaryElement.textContent = samples.length
            ? `Current download speed ${formatCompactBytes(current)} per second. Peak speed over the last minute ${formatCompactBytes(peak)} per second.`
            : 'Waiting for speed data.';
    }
}

export function redrawSpeedChart(canvas) {
    const state = chartState.get(canvas);
    if (state) drawSpeedHistory(canvas, state.samples, state.status);
}

export function disposeSpeedChart(canvas) {
    if (!canvas) return;
    resizeObserver?.unobserve(canvas);
    chartState.delete(canvas);
}

function formatCompactBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${Math.round(value)} B`;
    const units = ['KB', 'MB', 'GB'];
    let scaled = value / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && scaled >= 1024; index += 1) {
        scaled /= 1024;
        unit = units[index];
    }
    return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)} ${unit}`;
}
