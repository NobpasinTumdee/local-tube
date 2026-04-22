import MediaCard from './VideoCard';
import type { MediaEntry } from '../utils/directoryScanner';

interface Props {
  videos: MediaEntry[];
}

export default function VideoGrid({ videos }: Props) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-white/30">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p className="text-lg font-medium">No media found</p>
        <p className="text-sm">Try a different filter, search term, or select another folder.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {videos.map((v) => (
        <MediaCard key={v.id} video={v} />
      ))}
    </div>
  );
}
