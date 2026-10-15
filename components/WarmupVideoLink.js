import useWarmupVideo from '../hooks/useWarmupVideo';
export default function WarmupVideoLink({exercise,apiKey}){const url=useWarmupVideo(exercise,apiKey);return url?<a href={url} target="_blank" rel="noopener noreferrer">Видео техники ↗</a>:null;}
