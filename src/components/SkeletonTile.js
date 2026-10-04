import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '../store/useStore';
export default function SkeletonTile({ active = false, bare = false, fill = false }) {
    const cardAspectRatio = useStore((s) => s.cardAspectRatio);
    const aspectClass = cardAspectRatio === '9/16' ? 'aspect-[9/16]' : cardAspectRatio === '1/1' ? 'aspect-square' : 'aspect-video';
    return (_jsxs("div", { "aria-hidden": "true", className: fill ? 'h-full w-full' : undefined, children: [_jsx("div", { className: `relative overflow-hidden bg-content/[0.06] ${fill ? 'h-full w-full' : `rounded-2xl ring-1 ring-content/[0.06] ${aspectClass}`}`, children: active && (_jsx("div", { className: "absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-content/[0.09] to-transparent" })) }), !bare && (_jsxs("div", { className: "mt-3 flex gap-3", children: [_jsx("div", { className: `h-9 w-9 shrink-0 rounded-full bg-content/[0.06] ${active ? 'animate-pulse' : ''}` }), _jsxs("div", { className: "min-w-0 flex-1 space-y-2 pt-0.5", children: [_jsx("div", { className: `h-3 w-[85%] rounded bg-content/[0.06] ${active ? 'animate-pulse' : ''}` }), _jsx("div", { className: `h-2.5 w-[45%] rounded bg-content/[0.04] ${active ? 'animate-pulse' : ''}` })] })] }))] }));
}
