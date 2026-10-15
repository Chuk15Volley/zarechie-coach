import useWarmupVideo from '../hooks/useWarmupVideo';
export default function WarmupVideoPanel({exercise,apiKey,Panel}){const fallbackUrl=useWarmupVideo(exercise,apiKey);return <Panel name={exercise.name} apiKey={apiKey} fallbackUrl={fallbackUrl} exactSource/>;}
