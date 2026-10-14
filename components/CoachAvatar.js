import {useState} from 'react';
export default function CoachAvatar({player={},className=''}){
 const [failed,setFailed]=useState(null),photo=player.photo;
 const initials=String(player.name || '').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 return <span aria-hidden="true" className={'coach-avatar '+className}>{photo && failed!==photo?<img src={photo} alt={'Фото · '+player.name} loading="lazy" onError={()=>setFailed(photo)}/>:<span aria-label={'Фото отсутствует · '+(player.name || 'Игрок')}>{initials || '—'}</span>}</span>;
}
