import { useState } from 'react';
import PlayerVideoModal from '../player/PlayerVideoModal';
import PlayerVideoPreview from '../player/PlayerVideoPreview';
import { libraryVideoId } from '../../lib/exerciseLibraryView.mjs';
import { prescriptionText } from '../../lib/prevention/player-view.mjs';

export default function PlayerExerciseMedia({ exercise }) {
  const [opened, setOpened] = useState(false);
  const videoId = libraryVideoId(exercise.video);
  return <>
    <div className="player-media-slot">
      {videoId ? <PlayerVideoPreview name={exercise.name} videoId={videoId} onOpen={() => setOpened(true)} /> : exercise.video ? <a href={exercise.video} target="_blank" rel="noopener noreferrer" className="player-media-status">Видео упражнения ↗</a> : <div className="player-media-status">Видео уточнит тренер</div>}
    </div>
    {opened && videoId && <PlayerVideoModal name={exercise.name} videoId={videoId} watchUrl={exercise.video} onClose={() => setOpened(false)}>
      <div className="player-video-context">
        <p><strong>Назначено: </strong>{exercise.setCount} × {prescriptionText(exercise.reps)}{exercise.rir && exercise.rir !== '-' ? ` · RIR ${prescriptionText(exercise.rir)}` : ''}{exercise.rpe && exercise.rpe !== '-' ? ` · RPE ${prescriptionText(exercise.rpe)}` : ''}</p>
        {exercise.note && <p>{exercise.note}</p>}
        {exercise.sourceAdaptation && <p className="player-video-warning">Вариант по ограничению тренера: {exercise.sourceAdaptation.original.name} → {exercise.name}.</p>}
      </div>
    </PlayerVideoModal>}
  </>;
}
