export async function generateThumbnail(file, { seekTime = 1.0, quality = 0.72, maxWidth = 480 } = {}) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    try {
        await once(video, 'loadedmetadata');
        const target = Math.min(seekTime, Math.max(0, (video.duration || 0) - 0.05));
        video.currentTime = target;
        await once(video, 'seeked');
        const srcW = video.videoWidth || maxWidth;
        const srcH = video.videoHeight || Math.round((maxWidth * 9) / 16);
        const w = Math.min(srcW, maxWidth);
        const h = Math.round(srcH * (w / srcW));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('2D canvas unavailable');
        ctx.drawImage(video, 0, 0, w, h);
        return {
            dataUrl: canvas.toDataURL('image/jpeg', quality),
            duration: video.duration,
        };
    }
    finally {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
    }
}
function once(el, type) {
    return new Promise((resolve, reject) => {
        const ok = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error(`${type} failed`)); };
        const cleanup = () => {
            el.removeEventListener(type, ok);
            el.removeEventListener('error', fail);
        };
        el.addEventListener(type, ok, { once: true });
        el.addEventListener('error', fail, { once: true });
    });
}
export class ThumbnailQueue {
    constructor(concurrency = 3) {
        Object.defineProperty(this, "concurrency", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: concurrency
        });
        Object.defineProperty(this, "active", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "waiting", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    async run(task) {
        if (this.active >= this.concurrency) {
            await new Promise((r) => this.waiting.push(r));
        }
        this.active++;
        try {
            return await task();
        }
        finally {
            this.active--;
            this.waiting.shift()?.();
        }
    }
}
export const thumbnailQueue = new ThumbnailQueue(3);
