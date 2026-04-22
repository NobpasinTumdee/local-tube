import { useStore } from '../store/useStore';

interface Props {
  playlists: string[];
}

export default function Sidebar({ playlists }: Props) {
  const activePlaylist = useStore((s) => s.activePlaylist);
  const setActivePlaylist = useStore((s) => s.setActivePlaylist);
  const playVideo = useStore((s) => s.playVideo);
  const videos = useStore((s) => s.videos);

  const countFor = (p: string) => videos.filter((v) => v.playlist === p).length;
  const homeCount = videos.length;

  const item = (label: string, value: string | null, count: number, icon: React.ReactNode) => {
    const active = activePlaylist === value;
    return (
      <button
        key={label}
        onClick={() => { setActivePlaylist(value); playVideo(null); }}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          active
            ? 'bg-white/10 font-medium text-white'
            : 'text-white/60 hover:bg-white/5 hover:text-white/90'
        }`}
      >
        {icon}
        <span className="flex-1 truncate text-left">{label}</span>
        <span className="text-[11px] tabular-nums text-white/30">{count}</span>
      </button>
    );
  };

  return (
    <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/5 bg-[#0f0f0f] px-3 py-4">
      {/* Home */}
      {item(
        'Home',
        null,
        homeCount,
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 2-2m0 0 7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-4 0v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4" />
        </svg>,
      )}

      {playlists.length > 0 && (
        <>
          <div className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/25">
            Playlists
          </div>
          {playlists.map((p) =>
            item(
              p,
              p,
              countFor(p),
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
              </svg>,
            ),
          )}
        </>
      )}
    </aside>
  );
}
