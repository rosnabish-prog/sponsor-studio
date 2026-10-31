import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { AnnotationKind, type Annotation, type Prisma } from '../generated/prisma/client';
import { AuthRequest, SessionGuard } from './auth';
import { DatabaseService } from './database';
import { checkAnnotationTimes, mayEditStream } from './permissions';
import { TaskService } from './tasks';

export class CreateAnnotationDto {
  @IsEnum(AnnotationKind) kind!: AnnotationKind;
  @IsString() @Length(1, 100) labelId!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) start!: number;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) end?: number | null;
  @IsOptional() @IsString() @Length(1, 100) placement?: string | null;
  @IsOptional() @IsString() @Length(1, 100) quality?: string | null;
}

export class UpdateAnnotationDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) start?: number;
  @IsOptional() @IsString() @Length(1, 100) labelId?: string;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) end?: number | null;
  @IsOptional() @IsString() @Length(1, 100) placement?: string | null;
  @IsOptional() @IsString() @Length(1, 100) quality?: string | null;
}

export class DeleteAnnotationDto {
  @IsInt() @Min(1) expectedRevision!: number;
}

export class RestoreAnnotationDto {
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(1) expectedRevision!: number;
}

/** A history row captures one committed state, not a delta that can affect adjacent intervals. */
export function annotationSnapshot(annotation: Annotation): Prisma.InputJsonValue {
  return {
    kind:annotation.kind, labelId:annotation.labelId, start:annotation.start, end:annotation.end,
    placement:annotation.placement, quality:annotation.quality,
    createdBy:annotation.createdBy, createdAt:annotation.createdAt.toISOString(),
    deletedAt:annotation.deletedAt?.toISOString()??null,
  };
}

type SavedSnapshot = {kind:AnnotationKind;labelId:string;start:number;end:number|null;
  placement:string|null;quality:string|null;createdBy:string;createdAt:string;deletedAt:string|null};

@Injectable()
export class AnnotationService {
  constructor(private readonly db: DatabaseService, private readonly tasks: TaskService) {}

  private async lockStream(tx:Prisma.TransactionClient,workspaceId:string,taskId:string,kind:AnnotationKind){
    await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id"::text = ${taskId} AND "workspaceId"::text = ${workspaceId} FOR UPDATE`;
    const task=await tx.task.findUnique({where:{id:taskId}});
    if(!task||(kind==='SPONSOR'?task.sponsorsSubmittedAt:task.contextSubmittedAt)) {
      throw new ConflictException('Annotation stream has been submitted');
    }
  }

  async list(workspaceId: string, taskId: string, userId: string) {
    await this.tasks.find(workspaceId, taskId, userId);
    return this.db.annotation.findMany({ where: { taskId, deletedAt:null }, orderBy: [{ start: 'asc' }, { createdAt: 'asc' }] });
  }

  /** All edits are scoped by taskId AND annotationId. History is append-only. */
  async history(workspaceId:string,taskId:string,userId:string,annotationId?:string) {
    await this.tasks.find(workspaceId,taskId,userId);
    return this.db.annotationRevision.findMany({
      where:{taskId,...(annotationId?{annotationId}:{})},
      orderBy:annotationId?[{version:'desc'}]:[{createdAt:'desc'},{id:'desc'}],take:annotationId?500:250,
    });
  }

  private checkRevision(row:Annotation,expectedRevision:number) {
    if(!Number.isInteger(expectedRevision)||row.revision!==expectedRevision)
      throw new ConflictException('This annotation changed since it was opened. Reload this item before editing; other labels were preserved.');
  }

  private async recordRevision(tx:Prisma.TransactionClient,annotation:Annotation,action:string,actorId:string) {
    await tx.annotationRevision.create({data:{
      taskId:annotation.taskId,annotationId:annotation.id,version:annotation.revision,action,
      snapshot:annotationSnapshot(annotation),actorId,
    }});
  }

  private async ensureAvailable(tx:Prisma.TransactionClient,annotation:Annotation) {
    if(annotation.deletedAt!==null||annotation.end!==null)return;
    const active=await tx.annotation.findFirst({where:{
      taskId:annotation.taskId,kind:annotation.kind,labelId:annotation.labelId,
      end:null,deletedAt:null,id:{not:annotation.id},
    }});
    if(active)throw new ConflictException('Another LIVE interval already exists for this label');
    if(annotation.kind==='CAMERA') {
      const activeCamera=await tx.annotation.count({where:{
        taskId:annotation.taskId,kind:'CAMERA',end:null,deletedAt:null,id:{not:annotation.id},
      }});
      if(activeCamera)throw new ConflictException('Only one camera angle can be LIVE');
    }
  }

  private async requireStreamEdit(workspaceId: string, taskId: string, userId: string, kind: AnnotationKind) {
    const { task, role } = await this.tasks.find(workspaceId, taskId, userId);
    const isSponsor = kind === 'SPONSOR';
    if (!mayEditStream(role, userId,
      isSponsor ? task.sponsorAnalystId : task.contextAnalystId,
      isSponsor ? task.sponsorsSubmittedAt : task.contextSubmittedAt,
    )) throw new ForbiddenException('Stream is submitted or you are not its assigned analyst');
    return task;
  }

  async create(workspaceId: string, taskId: string, userId: string, input: CreateAnnotationDto) {
    const task = await this.requireStreamEdit(workspaceId, taskId, userId, input.kind);
    try { checkAnnotationTimes(input.start, input.end ?? null, task.durationSeconds); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    if (input.kind !== 'SPONSOR' && (input.placement || input.quality)) {
      throw new BadRequestException('Placement and quality apply only to sponsor annotations');
    }
    try{return await this.db.$transaction(async tx => {
      await this.lockStream(tx,workspaceId,taskId,input.kind);
      if (input.end == null) {
        const active = await tx.annotation.findFirst({ where: {
          taskId, end: null,deletedAt:null,
          kind: input.kind, labelId: input.labelId,
        } });
        if (active) throw new ConflictException('An annotation is already active for this label');
        if (input.kind === 'CAMERA') {
          const count = await tx.annotation.count({ where: { taskId, kind: 'CAMERA', end: null,deletedAt:null } });
          if (count >= 1) throw new ConflictException('Only one camera angle can be live. End the current interval before starting another');
        }
      }
      const annotation = await tx.annotation.create({ data: {
        taskId, kind: input.kind, labelId: input.labelId.trim(), start: input.start,
        end: input.end ?? null, placement: input.placement ?? null, quality: input.quality ?? null,
        createdBy: userId,
      } });
      await this.recordRevision(tx,annotation,'CREATED',userId);
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'ANNOTATION_CREATED', subjectId: annotation.id } });
      return annotation;
    });}catch(error){
      if((error as {code?:string}).code==='P2002')throw new ConflictException('Another active interval already exists');
      throw error;
    }
  }

  async update(workspaceId: string, taskId: string, annotationId: string, userId: string, input: UpdateAnnotationDto) {
    const current = await this.db.annotation.findFirst({ where: { id: annotationId, taskId,deletedAt:null } });
    if (!current) throw new NotFoundException('Annotation not found');
    const task = await this.requireStreamEdit(workspaceId, taskId, userId, current.kind);
    this.checkRevision(current,input.expectedRevision);
    if (input.end === null && current.end !== null) throw new BadRequestException('A closed annotation cannot be reopened');
    try { checkAnnotationTimes(input.start ?? current.start, input.end === undefined ? current.end : input.end, task.durationSeconds); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    if (current.kind !== 'SPONSOR' && (input.placement !== undefined || input.quality !== undefined)) {
      throw new BadRequestException('Placement and quality apply only to sponsor annotations');
    }
    if (input.labelId !== undefined && current.kind !== 'CAMERA') {
      throw new BadRequestException('Only camera annotations can change labels');
    }
    const {expectedRevision,...changes}=input;
    return this.db.$transaction(async tx => {
      await this.lockStream(tx,workspaceId,taskId,current.kind);
      const fresh=await tx.annotation.findFirst({where:{id:annotationId,taskId,deletedAt:null}});
      if(!fresh)throw new NotFoundException('Annotation was removed');
      this.checkRevision(fresh,expectedRevision);
      const annotation = await tx.annotation.update({ where: { id: annotationId }, data: {...changes,revision:{increment:1}} });
      await this.ensureAvailable(tx,annotation);
      await this.recordRevision(tx,annotation,'UPDATED',userId);
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'ANNOTATION_UPDATED', subjectId: annotationId,
        details: { beforeVersion:fresh.revision,afterVersion:annotation.revision } } });
      return annotation;
    });
  }

  async remove(workspaceId: string, taskId: string, annotationId: string, userId: string,input:DeleteAnnotationDto) {
    const current = await this.db.annotation.findFirst({ where: { id: annotationId, taskId,deletedAt:null } });
    if (!current) throw new NotFoundException('Annotation not found');
    await this.requireStreamEdit(workspaceId, taskId, userId, current.kind);
    return this.db.$transaction(async tx => {
      await this.lockStream(tx,workspaceId,taskId,current.kind);
      const fresh=await tx.annotation.findFirst({where:{id:annotationId,taskId,deletedAt:null}});
      if(!fresh)throw new NotFoundException('Annotation was already removed');
      this.checkRevision(fresh,input.expectedRevision);
      const annotation=await tx.annotation.update({where:{id:annotationId},data:{
        deletedAt:new Date(),deletedBy:userId,revision:{increment:1},
      }});
      await this.recordRevision(tx,annotation,'SOFT_DELETED',userId);
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'ANNOTATION_DELETED', subjectId: annotationId,
        details: { beforeVersion:fresh.revision,afterVersion:annotation.revision,softDeleted:true } } });
      return { ok: true,revision:annotation.revision };
    });
  }

  async restore(workspaceId:string,taskId:string,annotationId:string,userId:string,input:RestoreAnnotationDto) {
    const current=await this.db.annotation.findFirst({where:{id:annotationId,taskId}});
    if(!current)throw new NotFoundException('Annotation history not found');
    const task=await this.requireStreamEdit(workspaceId,taskId,userId,current.kind);
    return this.db.$transaction(async tx=>{
      await this.lockStream(tx,workspaceId,taskId,current.kind);
      const fresh=await tx.annotation.findFirst({where:{id:annotationId,taskId}});
      if(!fresh)throw new NotFoundException('Annotation not found');
      this.checkRevision(fresh,input.expectedRevision);
      const chosen=await tx.annotationRevision.findUnique({where:{annotationId_version:{annotationId,version:input.version}}});
      if(!chosen||chosen.taskId!==taskId)throw new NotFoundException('Revision not found for this annotation');
      const snapshot=chosen.snapshot as unknown as SavedSnapshot;
      if(snapshot.kind!==fresh.kind||typeof snapshot.labelId!=='string'||!Number.isFinite(snapshot.start))
        throw new BadRequestException('Revision is invalid');
      if(snapshot.deletedAt!==null)throw new BadRequestException('Select a revision with an annotation to restore');
      try{checkAnnotationTimes(snapshot.start,snapshot.end,task.durationSeconds)}
      catch(error){throw new BadRequestException((error as Error).message)}
      const annotation=await tx.annotation.update({where:{id:annotationId},data:{
        labelId:snapshot.labelId,start:snapshot.start,end:snapshot.end,
        placement:snapshot.placement,quality:snapshot.quality,
        deletedAt:null,deletedBy:null,revision:{increment:1},
      }});
      await this.ensureAvailable(tx,annotation);
      await this.recordRevision(tx,annotation,'RESTORED',userId);
      await tx.auditLog.create({data:{workspaceId,actorId:userId,action:'ANNOTATION_RESTORED',subjectId:annotationId,
        details:{fromVersion:fresh.revision,restoredVersion:input.version,toVersion:annotation.revision}}});
      return annotation;
    });
  }
}

@Controller('workspaces/:workspaceId/tasks/:taskId/annotations')
@UseGuards(SessionGuard)
export class AnnotationController {
  constructor(private readonly annotations: AnnotationService) {}

  @Get()
  list(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.annotations.list(workspaceId, taskId, req.userId);
  }

  @Get('history')
  history(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId:string,@Param('taskId',ParseUUIDPipe) taskId:string) {
    return this.annotations.history(workspaceId,taskId,req.userId);
  }

  @Get(':annotationId/history')
  itemHistory(@Req() req: AuthRequest,@Param('workspaceId',ParseUUIDPipe) workspaceId:string,
    @Param('taskId',ParseUUIDPipe) taskId:string,@Param('annotationId',ParseUUIDPipe) annotationId:string) {
    return this.annotations.history(workspaceId,taskId,req.userId,annotationId);
  }

  @Post()
  create(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() input: CreateAnnotationDto) {
    return this.annotations.create(workspaceId, taskId, req.userId, input);
  }

  @Patch(':annotationId')
  update(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Param('annotationId', ParseUUIDPipe) annotationId: string, @Body() input: UpdateAnnotationDto) {
    return this.annotations.update(workspaceId, taskId, annotationId, req.userId, input);
  }

  @Delete(':annotationId')
  remove(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Param('annotationId', ParseUUIDPipe) annotationId: string,@Body() input:DeleteAnnotationDto) {
    return this.annotations.remove(workspaceId, taskId, annotationId, req.userId,input);
  }

  @Post(':annotationId/restore')
  restore(@Req() req:AuthRequest,@Param('workspaceId',ParseUUIDPipe) workspaceId:string,
    @Param('taskId',ParseUUIDPipe) taskId:string,@Param('annotationId',ParseUUIDPipe) annotationId:string,@Body() input:RestoreAnnotationDto) {
    return this.annotations.restore(workspaceId,taskId,annotationId,req.userId,input);
  }
}
