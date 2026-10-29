import { randomBytes } from 'node:crypto';
import {
  Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param,
  ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsInt, IsObject, IsString, Length, Min } from 'class-validator';
import { BadRequestException, ConflictException, Put } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
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

export class SaveCatalogDto {
  // A workspace-level configuration document; normalized and bounded in the service.
  @IsObject()
  payload!: unknown;
  @IsInt() @Min(0)
  version!: number;
}

function validateCatalog(input: unknown): Prisma.InputJsonValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid catalog');
  const data = input as Record<string, unknown>;
  const groups: Record<string, unknown[]> = {};
  for (const key of ['sponsorGroups', 'eventGroups', 'cameraGroups']) {
    const entries = data[key];
    if (!Array.isArray(entries) || entries.length > 100) throw new BadRequestException(`Invalid ${key}`);
    groups[key] = entries.map((entry: unknown) => {
      const group = entry as Record<string, unknown>;
      if (!group || typeof group.id !== 'string' || group.id.length > 100 ||
        typeof group.name !== 'string' || group.name.length < 1 || group.name.length > 150) {
        throw new BadRequestException('Invalid catalog group');
      }
      const values = key === 'sponsorGroups' ? group.sponsors : group.items;
      if (!Array.isArray(values) || values.length > 300) throw new BadRequestException('Invalid catalog items');
      return {
        id: group.id,
        name: group.name,
        description: typeof group.description === 'string' ? group.description.slice(0, 500) : '',
        [key === 'sponsorGroups' ? 'sponsors' : 'items']: values.map((raw: unknown) => {
          const item = raw as Record<string, unknown>;
          if (!item || typeof item.id !== 'string' || item.id.length > 100 ||
            typeof item.name !== 'string' || item.name.length < 1 || item.name.length > 150) {
            throw new BadRequestException('Invalid catalog item');
          }
          return {
            id: item.id, name: item.name,
            ...(key === 'sponsorGroups' ? {
              logo: typeof item.logo === 'string' && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(item.logo) ? item.logo.slice(0, 100_000) : '',
              color: typeof item.color === 'string' && /^#[\da-f]{6}$/i.test(item.color) ? item.color : '#888888',
              logoTrimmed: item.logoTrimmed === true,
            } : { kind: item.kind === 'point' ? 'point' : 'range', highValue: item.highValue === true }),
          };
        }),
      };
    });
  }
  const json = JSON.stringify(groups);
  if (json.length > 500_000) throw new BadRequestException('Catalog is too large');
  return groups as Prisma.InputJsonValue;
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

  async members(workspaceId: string, userId: string) {
    await this.access(workspaceId, userId);
    return this.db.membership.findMany({ where: { workspaceId }, select: {
      role: true, user: { select: { id: true, name: true, email: true } },
    } });
  }

  async getCatalog(workspaceId: string, userId: string) {
    await this.access(workspaceId, userId);
    return await this.db.workspaceCatalog.findUnique({ where: { workspaceId } }) || {
      version: 0, payload: { sponsorGroups: [], eventGroups: [], cameraGroups: [] },
    };
  }

  async saveCatalog(workspaceId: string, userId: string, input: SaveCatalogDto) {
    const member = await this.access(workspaceId, userId);
    mustManage(member.role);
    if (!Number.isInteger(input.version) || input.version < 0) throw new BadRequestException('Invalid catalog version');
    const payload = validateCatalog(input.payload);
    return this.db.$transaction(async tx => {
      const current = await tx.workspaceCatalog.findUnique({ where: { workspaceId } });
      if ((current?.version ?? 0) !== input.version) throw new ConflictException('Catalog changed; reload before saving');
      const catalog = current
        ? await tx.workspaceCatalog.update({ where: { workspaceId }, data: { payload, version: { increment: 1 } } })
        : await tx.workspaceCatalog.create({ data: { workspaceId, payload, version: 1 } });
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'CATALOG_UPDATED', subjectId: workspaceId } });
      return catalog;
    });
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

  @Get(':workspaceId/members')
  members(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.members(workspaceId, req.userId);
  }

  @Get(':workspaceId/catalog')
  catalog(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.getCatalog(workspaceId, req.userId);
  }

  @Put(':workspaceId/catalog')
  saveCatalog(@Req() req: AuthRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string, @Body() input: SaveCatalogDto) {
    return this.workspaces.saveCatalog(workspaceId, req.userId, input);
  }
}
