import { Play } from 'lucide-react';

export default function PlayerVideoPreview({ name, videoId, onOpen }) {
  return <button type="button" className="player-exercise-media player-video-preview" onClick={onOpen} aria-label={`Смотреть технику: ${name}`}>
    <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" />
    <span className="player-video-button"><Play size={22} fill="currentColor" aria-hidden="true" /></span>
    <span className="player-video-caption">Смотреть технику</span>
  </button>;
}
