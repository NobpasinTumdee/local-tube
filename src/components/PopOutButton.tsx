import { PictureInPicture2 } from 'lucide-react';
import { useDocumentPiP, type PiPContent } from '../hooks/useDocumentPiP';

/* ─────────────────────────────────────────────────────────────
 *  POP-OUT BUTTON
 * ─────────────────────────────────────────────────────────────
 *  Shared trigger for Document Picture-in-Picture. Renders nothing at all
 *  where the API is unsupported rather than showing a dead control — unlike
 *  the player's pop-out, which has a meaningful fallback (native <video>
 *  PiP). There is no equivalent fallback for a chat panel or a room, so the
 *  honest thing is to leave the button out.
 *
 *  The click handler calls open() with nothing awaited before it: the
 *  browser consumes the user gesture at requestWindow(), and anything
 *  awaited first would silently forfeit it.
 * ───────────────────────────────────────────────────────────── */

/** Sensible starting sizes — chat is tall and narrow, a room is a video. */
const SIZES: Record<PiPContent, { width: number; height: number }> = {
  grid: { width: 720, height: 460 },
  chat: { width: 420, height: 620 },
  party: { width: 720, height: 520 },
};

interface Props {
  content: PiPContent;
  title?: string;
  className?: string;
}

export default function PopOutButton({ content, title, className = '' }: Props) {
  const { supported, pipWindow, content: current, open, close } = useDocumentPiP();
  if (!supported) return null;

  const isOut = !!pipWindow && current === content;

  return (
    <button
      onClick={() => {
        if (isOut) close();
        else void open(content, SIZES[content]);
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-content/10 ${
        isOut ? 'text-primary' : 'text-content/60 hover:text-content'
      } ${className}`}
      aria-label={isOut ? 'Return from the floating window' : 'Pop out into a floating window'}
      aria-pressed={isOut}
      title={isOut ? 'Bring it back into this window' : title ?? 'Pop out into a floating window'}
    >
      <PictureInPicture2 className="h-4 w-4" />
    </button>
  );
}
