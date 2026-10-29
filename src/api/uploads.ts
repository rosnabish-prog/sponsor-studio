import { api } from './client';

function sendPart(url:string,blob:Blob,onProgress:(bytes:number)=>void):Promise<string> {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('PUT',url);
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded)};
    xhr.onerror=()=>reject(new Error('S3 upload connection failed'));
    xhr.onabort=()=>reject(new Error('Upload aborted'));
    xhr.onload=()=>{
      if(xhr.status<200||xhr.status>=300)return reject(new Error(`S3 upload failed: ${xhr.status}`));
      const eTag=xhr.getResponseHeader('ETag');
      if(!eTag)return reject(new Error('S3 CORS must expose the ETag response header'));
      onProgress(blob.size);resolve(eTag);
    };
    xhr.send(blob);
  });
}

/** Browser-to-S3 multipart upload. Only 16 MB part slices are materialized in memory. */
export async function uploadMatchVideo(
  workspaceId:string,taskId:string,file:File,onProgress:(percent:number)=>void,
):Promise<{assetId:string}> {
  const mimeType=file.type||'application/octet-stream';
  const {assetId,partCount,partSize}=await api.startUpload(workspaceId,taskId,{
    filename:file.name,mimeType,sizeBytes:file.size,
  });
  const done:{partNumber:number;eTag:string}[]=[];
  const bytesByPart=new Map<number,number>();
  const update=()=>onProgress(Math.floor(100*[...bytesByPart.values()].reduce((s,n)=>s+n,0)/file.size));
  try{
    // Short signing batches prevent part URLs expiring during multi-hour uploads.
    for(let start=1;start<=partCount;start+=6){
      const numbers=Array.from({length:Math.min(6,partCount-start+1)},(_,i)=>start+i);
      const {parts}=await api.signParts(workspaceId,taskId,assetId,numbers);
      const jobs=[...parts];
      await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{
        while(jobs.length){
          const part=jobs.shift();if(!part)break;
          const offset=(part.partNumber-1)*partSize;
          const blob=file.slice(offset,Math.min(file.size,offset+partSize));
          let eTag='';
          for(let attempt=0;attempt<3;attempt++){
            try{eTag=await sendPart(part.url,blob,bytes=>{bytesByPart.set(part.partNumber,bytes);update()});break}
            catch(error){if(attempt===2)throw error}
          }
          done.push({partNumber:part.partNumber,eTag});
        }
      }));
    }
    await api.finishUpload(workspaceId,taskId,assetId,done.sort((a,b)=>a.partNumber-b.partNumber));
    onProgress(100);
    return {assetId};
  }catch(error){
    await api.abortUpload(workspaceId,taskId,assetId).catch(()=>{});
    throw error;
  }
}
