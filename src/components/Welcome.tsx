interface Props {
  onPick: () => void;
}

export default function Welcome({ onPick }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <div className="relative flex w-full max-w-lg flex-col items-center gap-8 rounded-2xl border border-white/5 bg-white/[0.03] p-12 text-center backdrop-blur-md">
        {/* decorative glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-80 rounded-full bg-red-600/20 blur-[100px]" />

        {/* logo */}
        <div className="relative flex items-center gap-2 text-2xl font-bold tracking-tight select-none">
          <svg viewBox="0 0 90 20" className="h-7 w-auto fill-white">
            <rect x="0" y="1" width="28" height="18" rx="4" className="fill-red-600" />
            <polygon points="11,5 11,15 21,10" className="fill-white" />
            <text x="32" y="15.5" fontFamily="Roboto,sans-serif" fontWeight="700" fontSize="14" className="fill-white">
              LocalTube
            </text>
          </svg>
        </div>

        <p className="text-sm leading-relaxed text-white/50 max-w-xs">
          Browse &amp; watch your local video collection with a beautiful YouTube‑like experience. No uploads, no server — everything stays private.
        </p>

        <button
          onClick={onPick}
          id="pick-folder-btn"
          className="group relative overflow-hidden rounded-full bg-red-600 px-8 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-red-600/25 transition-all hover:shadow-red-600/40 hover:scale-[1.03] active:scale-[0.97]"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
          <span className="relative flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            Select Video Folder
          </span>
        </button>

        <p className="text-[11px] text-white/25">
          Requires Chrome or Edge (File System Access API)
        </p>
      </div>
    </div>
  );
}
