/** Reconnect an interrupted remote video without changing the annotation timebase. */
export function recoverVideo(el:HTMLVideoElement, options:{
  position:()=>number;
  status:(message:string)=>void;
}) {
  const MAX_ATTEMPTS=3, TIMEOUT=30_000;
  let attempts=0, pending=false, failed=false, disposed=false, wantsPlay=!el.paused;
  let target=0, progressAt=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  const fail=()=>{
    clear();pending=false;failed=true;wantsPlay=false;
    options.status('Video connection interrupted. Check the connection and press play to retry; your tagging position is preserved.');
  };
  const attempt=()=>{
    if(disposed)return;
    clear();
    if(attempts>=MAX_ATTEMPTS){fail();return;}
    attempts++;
    options.status(`Reconnecting video (${attempts}/${MAX_ATTEMPTS})…`);
    timer=setTimeout(attempt,TIMEOUT);
    try{el.load();}catch{attempt();}
  };
  const begin=()=>{
    if(disposed||pending)return;
    failed=false;target=Math.max(0,options.position()||0);
    pending=true;
    attempt();
  };
  const finish=()=>{
    if(!pending)return;
    clear();pending=false;progressAt=target;
    options.status('');
    if(wantsPlay)void el.play().catch(()=>{
      if(!disposed){wantsPlay=false;options.status('Video reconnected. Press play to resume.');}
    });
  };
  const metadata=()=>{
    if(!pending)return;
    try{
      const time=Number.isFinite(el.duration)?Math.min(target,el.duration):target;
      target=time;
      el.currentTime=time;
      if(time===0)finish();
    }catch{attempt();}
  };
  const seeked=()=>{if(pending&&Math.abs(el.currentTime-target)<1)finish();};
  const error=()=>{if(failed)return;if(pending)attempt();else begin();};
  const waiting=()=>{
    if(pending||!wantsPlay)return;
    clear();timer=setTimeout(begin,TIMEOUT);
  };
  const progress=()=>{
    if(pending)return;
    clear();
    if(Math.abs(el.currentTime-progressAt)>=5)attempts=0;
  };
  const playing=()=>{wantsPlay=true;clear();};
  el.addEventListener('loadedmetadata',metadata);
  el.addEventListener('seeked',seeked);
  el.addEventListener('error',error);
  el.addEventListener('waiting',waiting);
  el.addEventListener('timeupdate',progress);
  el.addEventListener('playing',playing);
  return {
    isRecovering:()=>pending||failed,
    isPlaying:()=>failed?false:pending?wantsPlay:!el.paused,
    seek:(time:number)=>{
      if(!pending)return;
      target=time;
      if(el.readyState>=1){try{el.currentTime=time;if(time===0)finish();}catch{/* Retry on the next metadata load. */}}
    },
    toggle:()=>{
      if(pending){wantsPlay=!wantsPlay;return;}
      if(failed||el.error){attempts=0;wantsPlay=true;begin();return;}
      if(el.paused){wantsPlay=true;void el.play().catch(()=>{wantsPlay=false;options.status('Video playback unavailable. Press play to retry.');});}
      else{wantsPlay=false;clear();el.pause();}
    },
    dispose:()=>{
      disposed=true;clear();
      el.removeEventListener('loadedmetadata',metadata);
      el.removeEventListener('seeked',seeked);
      el.removeEventListener('error',error);
      el.removeEventListener('waiting',waiting);
      el.removeEventListener('timeupdate',progress);
      el.removeEventListener('playing',playing);
    },
  };
}
