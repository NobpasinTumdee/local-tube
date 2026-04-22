import { useStore } from '../store/useStore';

export default function Breadcrumb() {
  const rootName = useStore((s) => s.rootName);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const setCurrentFolder = useStore((s) => s.setCurrentFolder);

  /* Build segments: [{label, path}] */
  const segments: { label: string; path: string }[] = [
    { label: rootName || 'Home', path: '' },
  ];

  if (currentFolderPath) {
    const parts = currentFolderPath.split('/');
    parts.forEach((part, i) => {
      segments.push({ label: part, path: parts.slice(0, i + 1).join('/') });
    });
  }

  if (segments.length <= 1) return null; // at root — nothing to show

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.path} className="flex items-center gap-1">
            {i > 0 && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            {isLast ? (
              <span className="font-semibold text-white/80">{seg.label}</span>
            ) : (
              <button
                onClick={() => setCurrentFolder(seg.path)}
                className="text-white/40 transition hover:text-white/80"
              >
                {seg.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
