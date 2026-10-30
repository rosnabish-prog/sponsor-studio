import { randomUUID } from 'node:crypto';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand,
  S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as signS3 } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as signCloudFront } from '@aws-sdk/cloudfront-signer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Length, Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable,
  NotFoundException, Param, ParseUUIDPipe, Post, Req, ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import { AuthRequest, SessionGuard } from './auth';
import { DatabaseService } from './database';
import { TaskService } from './tasks';

const PART_SIZE = 16 * 1024 * 1024;
const MAX_BYTES = PART_SIZE * 10_000;

export class StartVideoDto {
  @IsString() @Length(1, 255) filename!: string;
  @IsString() @Length(1, 100) mimeType!: string;
  @IsInt() @Min(1) @Max(MAX_BYTES) sizeBytes!: number;
}

export class SignPartsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) parts!: number[];
}

export class CompletedPartDto {
  @IsInt() @Min(1) partNumber!: number;
  @IsString() @Length(10, 200) eTag!: string;
}

export class CompleteVideoDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10_000)
  @ValidateNested({ each: true }) @Type(() => CompletedPartDto) parts!: CompletedPartDto[];
}

@Injectable()
export class VideoService {
  private s3?: S3Client;
  constructor(private readonly db: DatabaseService, private readonly tasks: TaskService) {}

  private config() {
    const region=process.env.AWS_REGION, bucket=process.env.S3_VIDEO_BUCKET;
    if (!region || !bucket) throw new ServiceUnavailableException('Video storage is not configured');
    this.s3 ??= new S3Client({ region });
    return { client:this.s3,bucket };
  }

  private async canUpload(workspaceId:string,taskId:string,userId:string) {
    const {task,role}=await this.tasks.find(workspaceId,taskId,userId);
    if(role==='VIEWER'||role==='REVIEWER')throw new ForbiddenException('Viewers and reviewers cannot upload video');
    if (role!=='OWNER'&&role!=='ADMIN'&&task.sponsorAnalystId!==userId&&task.contextAnalystId!==userId) {
      throw new ForbiddenException('Only assigned workers or administrators can upload video');
    }
    return task;
  }

  private async uploadAsset(workspaceId:string,taskId:string,assetId:string,userId:string) {
    await this.canUpload(workspaceId,taskId,userId);
    const asset=await this.db.videoAsset.findFirst({where:{id:assetId,workspaceId,taskId}});
    if(!asset)throw new NotFoundException('Video upload not found');
    if(asset.uploadedBy!==userId)throw new ForbiddenException('Only the uploader can finish this upload');
    if(asset.status!=='UPLOADING'||!asset.uploadId)throw new BadRequestException('Video is not uploading');
    return asset;
  }

  async begin(workspaceId:string,taskId:string,userId:string,input:StartVideoDto) {
    await this.canUpload(workspaceId,taskId,userId);
    if(!/^(video\/(mp4|webm|quicktime|x-matroska)|application\/octet-stream)$/.test(input.mimeType)) {
      throw new BadRequestException('Unsupported video type');
    }
    const {client,bucket}=this.config();
    const safeName=input.filename.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(-120)||'video';
    const objectKey=`private/workspaces/${workspaceId}/tasks/${taskId}/${randomUUID()}/${safeName}`;
    const started=await client.send(new CreateMultipartUploadCommand({
      Bucket:bucket,Key:objectKey,ContentType:input.mimeType,ServerSideEncryption:'AES256',
    }));
    if(!started.UploadId)throw new ServiceUnavailableException('Could not start S3 upload');
    try {
      const asset=await this.db.videoAsset.create({data:{
        workspaceId,taskId,objectKey,uploadId:started.UploadId,partSize:PART_SIZE,
        filename:input.filename,mimeType:input.mimeType,sizeBytes:BigInt(input.sizeBytes),uploadedBy:userId,
      }});
      return {assetId:asset.id,partSize:PART_SIZE,partCount:Math.ceil(input.sizeBytes/PART_SIZE)};
    }catch(error){
      await client.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:objectKey,UploadId:started.UploadId})).catch(()=>{});
      throw error;
    }
  }

  async parts(workspaceId:string,taskId:string,assetId:string,userId:string,input:SignPartsDto) {
    const asset=await this.uploadAsset(workspaceId,taskId,assetId,userId);
    const {client,bucket}=this.config();
    const count=Math.ceil(Number(asset.sizeBytes)/asset.partSize);
    if(new Set(input.parts).size!==input.parts.length||input.parts.some(n=>n<1||n>count)) {
      throw new BadRequestException('Invalid part numbers');
    }
    const signed=await Promise.all(input.parts.map(async partNumber=>({
      partNumber,
      url:await signS3(client,new UploadPartCommand({
        Bucket:bucket,Key:asset.objectKey,UploadId:asset.uploadId!,PartNumber:partNumber,
      }),{expiresIn:15*60}),
    })));
    return {parts:signed};
  }

  async complete(workspaceId:string,taskId:string,assetId:string,userId:string,input:CompleteVideoDto) {
    const asset=await this.uploadAsset(workspaceId,taskId,assetId,userId);
    const expected=Math.ceil(Number(asset.sizeBytes)/asset.partSize);
    if(input.parts.length!==expected||input.parts.some((part,i)=>
      part.partNumber!==i+1||!/^["']?[a-f0-9-]{32,100}["']?$/i.test(part.eTag))) {
      throw new BadRequestException('Complete video requires all ordered S3 ETags');
    }
    const {client,bucket}=this.config();
    await client.send(new CompleteMultipartUploadCommand({
      Bucket:bucket,Key:asset.objectKey,UploadId:asset.uploadId!,
      MultipartUpload:{Parts:input.parts.map(part=>({PartNumber:part.partNumber,ETag:part.eTag}))},
    }));
    await this.db.$transaction(async tx=>{
      await tx.videoAsset.update({where:{id:asset.id},data:{status:'READY',uploadId:null}});
      await tx.auditLog.create({data:{workspaceId,actorId:userId,action:'VIDEO_UPLOADED',subjectId:asset.id}});
    });
    return {id:asset.id,filename:asset.filename,status:'READY'};
  }

  async playback(workspaceId:string,taskId:string,assetId:string,userId:string) {
    const {role}=await this.tasks.find(workspaceId,taskId,userId);
    if(role==='VIEWER')throw new ForbiddenException('Viewers may access insights and JSON exports only');
    const asset=await this.db.videoAsset.findFirst({where:{id:assetId,workspaceId,taskId,status:'READY'}});
    if(!asset)throw new NotFoundException('Video not found');
    const domain=process.env.CLOUDFRONT_VIDEO_DOMAIN;
    const keyPairId=process.env.CLOUDFRONT_KEY_PAIR_ID;
    const privateKey=process.env.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g,'\n');
    if(!domain||!keyPairId||!privateKey)throw new ServiceUnavailableException('Private video delivery is not configured');
    if(!/^https:\/\/[a-z\d.-]+$/i.test(domain))throw new ServiceUnavailableException('Invalid CloudFront domain');
    const url=`${domain}/${asset.objectKey.split('/').map(encodeURIComponent).join('/')}`;
    return {url:signCloudFront({url,keyPairId,privateKey,dateLessThan:new Date(Date.now()+3*60*60*1000).toISOString()}),
      expiresInSeconds:10800,filename:asset.filename};
  }

  async abort(workspaceId:string,taskId:string,assetId:string,userId:string) {
    const asset=await this.uploadAsset(workspaceId,taskId,assetId,userId);
    const {client,bucket}=this.config();
    await client.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:asset.objectKey,UploadId:asset.uploadId!}));
    await this.db.videoAsset.update({where:{id:asset.id},data:{status:'FAILED',uploadId:null}});
    return {ok:true};
  }
}

@Controller('workspaces/:workspaceId/tasks/:taskId/videos')
@UseGuards(SessionGuard)
export class VideoController {
  constructor(private readonly videos:VideoService) {}

  @Post()
  begin(@Req() req:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('taskId',ParseUUIDPipe) t:string,@Body() body:StartVideoDto) {
    return this.videos.begin(w,t,req.userId,body);
  }
  @Post(':assetId/parts')
  parts(@Req() req:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('taskId',ParseUUIDPipe) t:string,@Param('assetId',ParseUUIDPipe) a:string,@Body() body:SignPartsDto) {
    return this.videos.parts(w,t,a,req.userId,body);
  }
  @Post(':assetId/complete')
  complete(@Req() req:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('taskId',ParseUUIDPipe) t:string,@Param('assetId',ParseUUIDPipe) a:string,@Body() body:CompleteVideoDto) {
    return this.videos.complete(w,t,a,req.userId,body);
  }
  @Post(':assetId/abort')
  abort(@Req() req:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('taskId',ParseUUIDPipe) t:string,@Param('assetId',ParseUUIDPipe) a:string) {
    return this.videos.abort(w,t,a,req.userId);
  }
  @Get(':assetId/playback')
  playback(@Req() req:AuthRequest,@Param('workspaceId',ParseUUIDPipe) w:string,@Param('taskId',ParseUUIDPipe) t:string,@Param('assetId',ParseUUIDPipe) a:string) {
    return this.videos.playback(w,t,a,req.userId);
  }
}
