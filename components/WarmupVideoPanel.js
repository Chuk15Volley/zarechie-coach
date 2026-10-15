import useWarmupVideo from '../hooks/useWarmupVideo';
export default function WarmupVideoPanel({exercise,apiKey,Panel}){const video=useWarmupVideo(exercise,apiKey);return <Panel name={exercise.name} apiKey={apiKey} fallbackUrl={video.url} fallbackName={video.sourceName} fallbackLoading={video.loading} fallbackError={video.error} onRetryFallback={video.retry} exactSource compactMissingTools/>;}
