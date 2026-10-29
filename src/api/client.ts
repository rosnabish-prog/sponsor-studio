import type { StudioData, TaskSummary } from '../types/models';

/** GitHub Pages remains a demonstrator unless the production API is explicitly enabled. */
const runtimeEnv = import.meta.env || {};
export const apiEnabled = runtimeEnv.VITE_BACKEND_ENABLED === 'true';
const baseUrl = (runtimeEnv.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function apiRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method, credentials: 'include',
    headers: data === undefined ? undefined : { 'content-type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string | string[] };
    throw new ApiError(response.status, Array.isArray(result.message) ? result.message.join('; ') : result.message || `Server error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface ApiUser { id: string; name: string; email: string }
export interface ApiMembership { role: 'OWNER'|'ADMIN'|'ANALYST'|'REVIEWER'; workspace: { id:string;name:string;slug:string } }
export interface ApiTeamMembership { role: ApiMembership['role']; user: ApiUser }
export interface ApiCatalog { version: number; payload: Pick<StudioData,'sponsorGroups'|'eventGroups'|'cameraGroups'> }
export interface ApiAnnotation {
  id:string; kind:'SPONSOR'|'EVENT'|'CAMERA';labelId:string;
  start:number;end:number|null;placement:string|null;quality:string|null;createdBy:string;createdAt:string;
}
export interface ApiTask {
  id:string;workspaceId:string;number:string;name:string;fixtureId:string|null;
  matchDate:string|null;durationSeconds:number;sponsorAnalystId:string|null;contextAnalystId:string|null;
  sponsorsSubmittedAt:string|null;contextSubmittedAt:string|null;createdAt:string;
  metadata: Record<string,unknown>|null;annotations:ApiAnnotation[];
  videos?: {id:string;filename:string;mimeType:string}[];
}

export const api = {
  me: () => apiRequest<{user:ApiUser}>('/auth/me'),
  register: (body: { name:string;email:string;password:string }) => apiRequest<{user:ApiUser}>('/auth/register','POST',body),
  login: (body: {email:string;password:string}) => apiRequest<{user:ApiUser}>('/auth/login','POST',body),
  logout: () => apiRequest<{ok:boolean}>('/auth/logout','POST'),
  requestPasswordReset:(email:string)=>apiRequest<{ok:boolean}>('/auth/password-reset/request','POST',{email}),
  resetPassword:(token:string,password:string)=>apiRequest<{ok:boolean}>('/auth/password-reset/confirm','POST',{token,password}),
  workspaces: () => apiRequest<ApiMembership[]>('/workspaces'),
  createWorkspace: (name:string) => apiRequest<{id:string;name:string;slug:string}>('/workspaces','POST',{name}),
  members: (w:string) => apiRequest<ApiTeamMembership[]>(`/workspaces/${w}/members`),
  addMember: (w:string,email:string,role:ApiMembership['role']) => apiRequest<ApiTeamMembership>(`/workspaces/${w}/members`,'POST',{email,role}),
  catalog: (w:string) => apiRequest<ApiCatalog>(`/workspaces/${w}/catalog`),
  saveCatalog: (w:string,payload:ApiCatalog['payload'],version:number) => apiRequest<ApiCatalog>(`/workspaces/${w}/catalog`,'PUT',{payload,version}),
  tasks: (w:string) => apiRequest<ApiTask[]>(`/workspaces/${w}/tasks`),
  createTask: (w:string,body:Record<string,unknown>) => apiRequest<ApiTask>(`/workspaces/${w}/tasks`,'POST',body),
  updateTask: (w:string,id:string,body:Record<string,unknown>) => apiRequest<ApiTask>(`/workspaces/${w}/tasks/${id}`,'PATCH',body),
  submit: (w:string,id:string,stream:'sponsors'|'context') => apiRequest<{ok:boolean}>(`/workspaces/${w}/tasks/${id}/submit`,'POST',{stream}),
  reopen: (w:string,id:string,stream:'sponsors'|'context') => apiRequest<{ok:boolean}>(`/workspaces/${w}/tasks/${id}/reopen`,'POST',{stream}),
  addAnnotation: (w:string,id:string,body:Record<string,unknown>) => apiRequest<ApiAnnotation>(`/workspaces/${w}/tasks/${id}/annotations`,'POST',body),
  updateAnnotation: (w:string,id:string,a:string,body:Record<string,unknown>) => apiRequest<ApiAnnotation>(`/workspaces/${w}/tasks/${id}/annotations/${a}`,'PATCH',body),
  removeAnnotation: (w:string,id:string,a:string) => apiRequest<{ok:boolean}>(`/workspaces/${w}/tasks/${id}/annotations/${a}`,'DELETE'),
  startUpload:(w:string,t:string,body:{filename:string;mimeType:string;sizeBytes:number})=>apiRequest<{assetId:string;partSize:number;partCount:number}>(`/workspaces/${w}/tasks/${t}/videos`,'POST',body),
  signParts:(w:string,t:string,a:string,parts:number[])=>apiRequest<{parts:{partNumber:number;url:string}[]}>(`/workspaces/${w}/tasks/${t}/videos/${a}/parts`,'POST',{parts}),
  finishUpload:(w:string,t:string,a:string,parts:{partNumber:number;eTag:string}[])=>apiRequest<{id:string;filename:string;status:string}>(`/workspaces/${w}/tasks/${t}/videos/${a}/complete`,'POST',{parts}),
  abortUpload:(w:string,t:string,a:string)=>apiRequest<{ok:boolean}>(`/workspaces/${w}/tasks/${t}/videos/${a}/abort`,'POST'),
  playback:(w:string,t:string,a:string)=>apiRequest<{url:string;expiresInSeconds:number;filename:string}>(`/workspaces/${w}/tasks/${t}/videos/${a}/playback`),
};

export function fromApiTask(t:ApiTask):TaskSummary {
  const m=t.metadata||{};
  const list=(value:unknown)=>Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];
  const annotations=t.annotations||[];
  const common=(a:ApiAnnotation)=>({id:a.id,start:a.start,end:a.end,createdBy:a.createdBy,createdAt:a.createdAt});
  return {
    id:t.id,number:t.number,name:t.name,fixtureId:t.fixtureId||undefined,
    date:t.matchDate?.slice(0,10),duration:t.durationSeconds,
    sponsorGroupIds:list(m.sponsorGroupIds),eventGroupIds:list(m.eventGroupIds),cameraGroupIds:list(m.cameraGroupIds),
    sponsorAnalystId:t.sponsorAnalystId||'',contextAnalystId:t.contextAnalystId||'',
    submitted:{sponsors:!!t.sponsorsSubmittedAt,context:!!t.contextSubmittedAt},
    videoType:(t.videos?.length?'s3':m.videoType==='https'||m.videoType==='ftp'||m.videoType==='s3'?m.videoType:'none') as TaskSummary['videoType'],
    videoUrl:typeof m.videoUrl==='string'?m.videoUrl:'',
    videoName:t.videos?.[0]?.filename,
    videoAssetId:t.videos?.[0]?.id,
    periods:m.periods && typeof m.periods==='object'?m.periods as TaskSummary['periods']:null,
    sponsors:annotations.filter(a=>a.kind==='SPONSOR').map(a=>({...common(a),sponsorId:a.labelId,placement:a.placement,quality:a.quality})),
    events:annotations.filter(a=>a.kind==='EVENT').map(a=>({...common(a),eventId:a.labelId,kind:'range' as const})),
    cameras:annotations.filter(a=>a.kind==='CAMERA').map(a=>({...common(a),cameraId:a.labelId})),
    createdAt:t.createdAt,demo:false,
  };
}

export function toApiMetadata(task:TaskSummary) {
  return { sponsorGroupIds:task.sponsorGroupIds,eventGroupIds:task.eventGroupIds,cameraGroupIds:task.cameraGroupIds,
    periods:task.periods||null,videoType:task.videoType||'none',videoUrl:task.videoType==='s3'?'':task.videoUrl||'' };
}
