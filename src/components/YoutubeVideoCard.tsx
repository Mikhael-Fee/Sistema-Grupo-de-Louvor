import { ExternalLink, Play } from 'lucide-react';
import { normalizeYouTubeUrl, youtubeThumbnailUrl } from '../lib/youtube';
import './youtube-video.css';

/** A lightweight preview: playback stays on YouTube and no player is loaded. */
export default function YoutubeVideoCard({ url, title, caption = 'Vídeo no YouTube' }: { url: string; title: string; caption?: string }) {
  const href = normalizeYouTubeUrl(url);
  const thumbnail = youtubeThumbnailUrl(url);
  if (!href || !thumbnail) return null;
  return <a className="youtube-video-card" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Assistir ${title} no YouTube`}>
    <span className="youtube-video-cover"><img src={thumbnail} alt="" loading="lazy" decoding="async" width={480} height={360} /><span className="youtube-video-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span></span>
    <span className="youtube-video-copy"><small>{caption}</small><strong>{title}</strong><span>Abrir no YouTube <ExternalLink size={13} aria-hidden="true" /></span></span>
  </a>;
}
