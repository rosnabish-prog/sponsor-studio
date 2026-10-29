import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { AnnotationKind } from '../generated/prisma/client';
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
  @IsOptional() @IsString() @Length(1, 100) labelId?: string;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) end?: number | null;
  @IsOptional() @IsString() @Length(1, 100) placement?: string | null;
  @IsOptional() @IsString() @Length(1, 100) quality?: string | null;
}

@Injectable()
export class AnnotationService {
  constructor(private readonly db: DatabaseService, private readonly tasks: TaskService) {}

  async list(workspaceId: string, taskId: string, userId: string) {
    await this.tasks.find(workspaceId, taskId, userId);
    return this.db.annotation.findMany({ where: { taskId }, orderBy: [{ start: 'asc' }, { createdAt: 'asc' }] });
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
    return this.db.$transaction(async tx => {
      if (input.end == null) {
        const active = await tx.annotation.findFirst({ where: {
          taskId, end: null,
          ...(input.kind === 'CAMERA' ? { kind: 'CAMERA' as const } : { kind: input.kind, labelId: input.labelId }),
        } });
        if (active) throw new ConflictException('An annotation is already active for this label or camera stream');
      }
      const annotation = await tx.annotation.create({ data: {
        taskId, kind: input.kind, labelId: input.labelId.trim(), start: input.start,
        end: input.end ?? null, placement: input.placement ?? null, quality: input.quality ?? null,
        createdBy: userId,
      } });
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'ANNOTATION_CREATED', subjectId: annotation.id } });
      return annotation;
    });
  }

  async update(workspaceId: string, taskId: string, annotationId: string, userId: string, input: UpdateAnnotationDto) {
    const current = await this.db.annotation.findFirst({ where: { id: annotationId, taskId } });
    if (!current) throw new NotFoundException('Annotation not found');
    const task = await this.requireStreamEdit(workspaceId, taskId, userId, current.kind);
    if (input.end === null && current.end !== null) throw new BadRequestException('A closed annotation cannot be reopened');
    try { checkAnnotationTimes(current.start, input.end === undefined ? current.end : input.end, task.durationSeconds); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    if (current.kind !== 'SPONSOR' && (input.placement !== undefined || input.quality !== undefined)) {
      throw new BadRequestException('Placement and quality apply only to sponsor annotations');
    }
    if (input.labelId !== undefined && current.kind !== 'CAMERA') {
      throw new BadRequestException('Only camera annotations can change labels');
    }
    return this.db.$transaction(async tx => {
      const annotation = await tx.annotation.update({ where: { id: annotationId }, data: input });
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'ANNOTATION_UPDATED', subjectId: annotationId } });
      return annotation;
    });
  }

  async remove(workspaceId: string, taskId: string, annotationId: string, userId: string) {
    const current = await this.db.annotation.findFirst({ where: { id: annotationId, taskId } });
    if (!current) throw new NotFoundException('Annotation not found');
    await this.requireStreamEdit(workspaceId, taskId, userId, current.kind);
    return this.db.$transaction(async tx => {
      await tx.annotation.delete({ where: { id: annotationId } });
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'ANNOTATION_DELETED', subjectId: annotationId } });
      return { ok: true };
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

  @Post()
  create(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() input: CreateAnnotationDto) {
    return this.annotations.create(workspaceId, taskId, req.userId, input);
  }

  @Patch(':annotationId')
  update(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Param('annotationId', ParseUUIDPipe) annotationId: string, @Body() input: UpdateAnnotationDto) {
    return this.annotations.update(workspaceId, taskId, annotationId, req.userId, input);
  }

  @Delete(':annotationId')
  remove(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Param('annotationId', ParseUUIDPipe) annotationId: string) {
    return this.annotations.remove(workspaceId, taskId, annotationId, req.userId);
  }
}
