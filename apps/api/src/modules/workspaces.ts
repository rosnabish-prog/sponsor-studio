import { randomBytes } from 'node:crypto';
import {
  Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param,
  ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsString, Length } from 'class-validator';
import { WorkspaceRole } from '../generated/prisma/client';
import { AuthRequest, SessionGuard } from './auth';
import { DatabaseService } from './database';
import { mustManage } from './permissions';

export class CreateWorkspaceDto {
  @IsString() @Length(2, 150) name!: string;
}

export class AddMemberDto {
  @IsEmail() email!: string;
  @IsEnum(WorkspaceRole) role!: WorkspaceRole;
}

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}

  async access(workspaceId: string, userId: string) {
    const member = await this.db.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member) throw new NotFoundException('Workspace not found');
    return member;
  }

  async list(userId: string) {
    return this.db.membership.findMany({
      where: { userId },
      select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async create(userId: string, input: CreateWorkspaceDto) {
    const name = input.name.trim();
    const slugBase = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 75) || 'workspace';
    const slug = `${slugBase}-${randomBytes(4).toString('hex')}`;
    return this.db.workspace.create({
      data: { name, slug, memberships: { create: { userId, role: 'OWNER' } } },
      select: { id: true, name: true, slug: true },
    });
  }

  async addMember(workspaceId: string, actorId: string, input: AddMemberDto) {
    const actor = await this.access(workspaceId, actorId);
    mustManage(actor.role);
    if (input.role === 'OWNER') throw new ForbiddenException('Ownership transfer is not supported by this endpoint');
    const user = await this.db.user.findUnique({ where: { email: input.email.trim().toLowerCase() }, select: { id: true, name: true, email: true } });
    if (!user) throw new NotFoundException('User must register before being added to a workspace');
    const existing = await this.db.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } });
    if (existing?.role === 'OWNER') throw new ForbiddenException('Cannot change owner role');
    const membership = await this.db.membership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: { role: input.role },
      create: { workspaceId, userId: user.id, role: input.role },
      select: { id: true, role: true },
    });
    return { membership, user };
  }
}

@Controller('workspaces')
@UseGuards(SessionGuard)
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Get()
  list(@Req() req: AuthRequest) { return this.workspaces.list(req.userId); }

  @Post()
  create(@Req() req: AuthRequest, @Body() input: CreateWorkspaceDto) {
    return this.workspaces.create(req.userId, input);
  }

  @Post(':workspaceId/members')
  addMember(
    @Req() req: AuthRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() input: AddMemberDto,
  ) {
    return this.workspaces.addMember(workspaceId, req.userId, input);
  }
}
