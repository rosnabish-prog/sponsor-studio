import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException,
  Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { AuthRequest, SessionGuard } from './auth';
import type { Prisma } from '../generated/prisma/client';
import { DatabaseService } from './database';
import { canAccessTask, mustManage } from './permissions';
import { WorkspaceService } from './workspaces';

export class CreateTaskDto {
  @IsString() @Length(1, 100) number!: string;
  @IsString() @Length(1, 250) name!: string;
  @IsOptional() @IsString() @Length(1, 100) fixtureId?: string;
  @IsOptional() @IsDateString() matchDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(864_000) durationSeconds?: number;
  @IsOptional() @IsUUID() sponsorAnalystId?: string;
  @IsOptional() @IsUUID() contextAnalystId?: string;
  @IsOptional() @IsObject() metadata?: unknown;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @Length(1, 250) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(864_000) durationSeconds?: number;
  @IsOptional() @IsUUID() sponsorAnalystId?: string;
  @IsOptional() @IsUUID() contextAnalystId?: string;
  @IsOptional() @IsObject() metadata?: unknown;
}

function validateMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid task metadata');
  const data = value as Record<string, unknown>;
  const ids = (key: string) => {
    const list = data[key];
    if (!Array.isArray(list) || list.length > 100 || list.some(v => typeof v !== 'string' || v.length > 100)) {
      throw new BadRequestException(`Invalid ${key}`);
    }
    return list as string[];
  };
  if (data.videoType === 'buildup' && (typeof data.buildupMatchId !== 'string' || !/^[1-9]\d{0,14}$/.test(data.buildupMatchId))) {
    throw new BadRequestException('Invalid BuildUp match ID');
  }
  const safe = {
    sponsorGroupIds: ids('sponsorGroupIds'), eventGroupIds: ids('eventGroupIds'), cameraGroupIds: ids('cameraGroupIds'),
    periods: data.periods && typeof data.periods === 'object' ? data.periods : null,
    videoType: ['none','https','ftp','s3','buildup'].includes(String(data.videoType)) ? data.videoType : 'none',
    videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl.slice(0, 2048) : '',
    buildupMatchId: data.videoType === 'buildup' ? data.buildupMatchId : '',
  };
  if (JSON.stringify(safe).length > 10_000) throw new BadRequestException('Task metadata too large');
  return safe as Prisma.InputJsonValue;
}

export class TaskStreamDto {
  @IsIn(['sponsors', 'context']) stream!: 'sponsors' | 'context';
}

@Injectable()
export class TaskService {
  constructor(private readonly db: DatabaseService, private readonly workspaces: WorkspaceService) {}

  async listed(workspaceId: string, userId: string) {
    const member = await this.workspaces.access(workspaceId, userId);
    const where = member.role === 'OWNER' || member.role === 'ADMIN' || member.role === 'REVIEWER'
      ? { workspaceId }
      : { workspaceId, OR: [{ sponsorAnalystId: userId }, { contextAnalystId: userId }] };
    return this.db.task.findMany({ where, include: { annotations: true, videos: {
      where: { status: 'READY' }, select: { id: true, filename: true, mimeType: true }, orderBy: { createdAt: 'desc' }, take: 1,
    } }, orderBy: { createdAt: 'desc' } });
  }

  async find(workspaceId: string, taskId: string, userId: string) {
    const member = await this.workspaces.access(workspaceId, userId);
    const task = await this.db.task.findFirst({ where: { id: taskId, workspaceId } });
    if (!task || !canAccessTask(member.role, userId, task.sponsorAnalystId, task.contextAnalystId)) {
      throw new NotFoundException('Task not found');
    }
    return { task, role: member.role };
  }

  async checkAssignments(workspaceId: string, ids: (string | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!unique.length) return;
    const count = await this.db.membership.count({ where: { workspaceId, userId: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException('Assigned analysts must belong to this workspace');
  }

  async create(workspaceId: string, actorId: string, input: CreateTaskDto) {
    const member = await this.workspaces.access(workspaceId, actorId);
    mustManage(member.role);
    await this.checkAssignments(workspaceId, [input.sponsorAnalystId, input.contextAnalystId]);
    try {
      return await this.db.$transaction(async tx => {
        const task = await tx.task.create({ data: {
          workspaceId, number: input.number.trim(), name: input.name.trim(), fixtureId: input.fixtureId,
          matchDate: input.matchDate ? new Date(input.matchDate) : undefined,
          durationSeconds: input.durationSeconds ?? 0,
          metadata: validateMetadata(input.metadata),
          sponsorAnalystId: input.sponsorAnalystId, contextAnalystId: input.contextAnalystId,
        } });
        await tx.auditLog.create({ data: { workspaceId, actorId, action: 'TASK_CREATED', subjectId: task.id } });
        return task;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Task number already used in this workspace');
      throw error;
    }
  }

  async update(workspaceId: string, taskId: string, actorId: string, input: UpdateTaskDto) {
    const { task, role } = await this.find(workspaceId, taskId, actorId);
    mustManage(role);
    await this.checkAssignments(workspaceId, [input.sponsorAnalystId, input.contextAnalystId]);
    if (input.durationSeconds !== undefined && input.durationSeconds < task.durationSeconds) {
      const invalidAnnotation = await this.db.annotation.count({ where: {
        taskId, OR: [{ start: { gt: input.durationSeconds } }, { end: { gt: input.durationSeconds } }],
      } });
      if (invalidAnnotation) throw new ConflictException('Existing annotations extend beyond the new duration');
    }
    return this.db.$transaction(async tx => {
      const changed = await tx.task.update({ where: { id: taskId }, data: { ...input, metadata: validateMetadata(input.metadata) } });
      await tx.auditLog.create({ data: { workspaceId, actorId, action: 'TASK_UPDATED', subjectId: taskId } });
      return changed;
    });
  }

  async submit(workspaceId: string, taskId: string, actorId: string, stream: 'sponsors' | 'context') {
    const { task, role } = await this.find(workspaceId, taskId, actorId);
    const assigned = stream === 'sponsors' ? task.sponsorAnalystId : task.contextAnalystId;
    if (role !== 'OWNER' && role !== 'ADMIN' && assigned !== actorId) throw new ForbiddenException('Not assigned to this stream');
    const field = stream === 'sponsors' ? 'sponsorsSubmittedAt' : 'contextSubmittedAt';
    if (task[field]) throw new ConflictException('Stream already submitted');
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id"::text = ${taskId} AND "workspaceId"::text = ${workspaceId} FOR UPDATE`;
      const active = await tx.annotation.count({ where: {
        taskId, end: null,
        kind: stream === 'sponsors' ? 'SPONSOR' : { in: ['EVENT', 'CAMERA'] },
      } });
      if (active) throw new ConflictException('Close active annotation intervals before submitting');
      const updated = await tx.task.updateMany({ where: { id: taskId, [field]: null }, data: { [field]: new Date() } });
      if (!updated.count) throw new ConflictException('Stream already submitted');
      await tx.auditLog.create({ data: { workspaceId, actorId, action: 'STREAM_SUBMITTED', subjectId: taskId, details: { stream } } });
      return { ok: true };
    });
  }

  async reopen(workspaceId: string, taskId: string, actorId: string, stream: 'sponsors' | 'context') {
    const { role } = await this.find(workspaceId, taskId, actorId);
    mustManage(role);
    const field = stream === 'sponsors' ? 'sponsorsSubmittedAt' : 'contextSubmittedAt';
    return this.db.$transaction(async tx => {
      await tx.task.update({ where: { id: taskId }, data: { [field]: null } });
      await tx.auditLog.create({ data: { workspaceId, actorId, action: 'STREAM_REOPENED', subjectId: taskId, details: { stream } } });
      return { ok: true };
    });
  }
}

@Controller('workspaces/:workspaceId/tasks')
@UseGuards(SessionGuard)
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  list(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.tasks.listed(workspaceId, req.userId);
  }

  @Post()
  create(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() input: CreateTaskDto) {
    return this.tasks.create(workspaceId, req.userId, input);
  }

  @Get(':taskId')
  async get(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string) {
    return (await this.tasks.find(workspaceId, taskId, req.userId)).task;
  }

  @Patch(':taskId')
  update(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() input: UpdateTaskDto) {
    return this.tasks.update(workspaceId, taskId, req.userId, input);
  }

  @Post(':taskId/submit')
  submit(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() input: TaskStreamDto) {
    return this.tasks.submit(workspaceId, taskId, req.userId, input.stream);
  }

  @Post(':taskId/reopen')
  reopen(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() input: TaskStreamDto) {
    return this.tasks.reopen(workspaceId, taskId, req.userId, input.stream);
  }
}
