import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
/*
 * "Ambient Mode" cinema glow — a soft, dynamic halo of the video's current
 * colors, YouTube-style.
 *
 * Performance: we draw the current video frame into a TINY 32×18 canvas at only
 * 2fps, then let CSS (`blur-3xl`, `scale-105`, `opacity-40`) do the expensive
 * work on the GPU. That keeps frame sampling off the hot path so playback stays
 * smooth. Sampling pauses automatically when the tab is hidden.
 */
export default function AmbientGlow({ videoRef, active, intervalMs = 500, className = '' }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!active)
            return;
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        /* tiny sample target — upscaled + blurred by CSS into a soft wash */
        canvas.width = 32;
        canvas.height = 18;
        let stopped = false;
        const draw = () => {
            if (stopped || document.hidden)
                return;
            const v = videoRef.current;
            if (v && v.readyState >= 2 && v.videoWidth) {
                try {
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                }
                catch {
                    /* would only throw on a tainted canvas; local blob videos are same-origin */
                }
            }
        };
        draw();
        const timer = window.setInterval(draw, intervalMs);
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [active, videoRef, intervalMs]);
    if (!active)
        return null;
    return (_jsx("canvas", { ref: canvasRef, "aria-hidden": "true", className: `pointer-events-none absolute inset-0 h-full w-full scale-105 opacity-40 blur-3xl transition-opacity duration-500 ${className}` }));
}
