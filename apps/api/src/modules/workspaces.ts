import { randomBytes } from 'node:crypto';
import {
  Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param,
  ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsInt, IsObject, IsString, Length, Min } from 'class-validator';
import { BadRequestException, ConflictException, Put } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { WorkspaceRole } from '../generated/prisma/client';
import { AuthRequest, hashPassword, SessionGuard } from './auth';
import { DatabaseService } from './database';
import { mustManage } from './permissions';

export class CreateWorkspaceDto {
  @IsString() @Length(2, 150) name!: string;
}

export class AddMemberDto {
  @IsEmail() email!: string;
  @IsEnum(WorkspaceRole) role!: WorkspaceRole;
}

export class ProvisionMemberDto extends AddMemberDto {
  @IsString() @Length(1, 150) name!: string;
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
  const assignedHotkeys = new Map<string,string>();
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
          const hotkey=typeof item.hotkey==='string' && /^(?:(?:ctrl|alt)\+)?[a-z0-9]$/.test(item.hotkey)?item.hotkey:'';
          const owner=assignedHotkeys.get(hotkey);
          if(hotkey&&owner&&owner!==item.id)throw new BadRequestException(`Shortcut ${hotkey} is already assigned`);
          if(hotkey)assignedHotkeys.set(hotkey,item.id);
          return {
            id: item.id, name: item.name,
            hotkey,
            ...(key === 'sponsorGroups' ? {
              // Never truncate a Base64 image: even one character missing corrupts the PNG.
              logo: typeof item.logo === 'string' && /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(item.logo) ? item.logo : '',
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

  /** Provision an analyst without email: reveal the temporary password once to the administrator. */
  async provisionMember(workspaceId: string, actorId: string, input: ProvisionMemberDto) {
    const actor = await this.access(workspaceId, actorId);
    mustManage(actor.role);
    if (input.role === 'OWNER') throw new ForbiddenException('Ownership cannot be provisioned here');
    if (input.role === 'ADMIN' && actor.role !== 'OWNER') throw new ForbiddenException('Only owners can provision admins');
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name required');
    return this.db.$transaction(async tx => {
      let user = await tx.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
      let temporaryPassword: string | null = null;
      if (!user) {
        temporaryPassword = randomBytes(24).toString('base64url');
        const passwordHash = await hashPassword(temporaryPassword);
        user = await tx.user.create({
          data: { email, name, passwordHash, passwordChangeRequired: true,
            temporaryPasswordExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
          select: { id: true, email: true, name: true },
        });
      }
      const existing = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
      });
      if (existing?.role === 'OWNER') throw new ForbiddenException('Cannot change an owner');
      const membership = await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
        create: { workspaceId, userId: user.id, role: input.role },
        update: { role: input.role },
        select: { id: true, role: true },
      });
      await tx.auditLog.create({
        data: { workspaceId, actorId, action: temporaryPassword ? 'USER_PROVISIONED' : 'MEMBER_ADDED', subjectId: user.id },
      });
      return { user, membership, temporaryPassword };
    });
  }

  async resetMemberPassword(workspaceId: string, actorId: string, memberId: string) {
    const actor = await this.access(workspaceId, actorId);
    mustManage(actor.role);
    const target = await this.db.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    if (!target) throw new NotFoundException('Team member not found');
    if (target.role === 'OWNER' || (target.role === 'ADMIN' && actor.role !== 'OWNER')) {
      throw new ForbiddenException('Cannot reset this account');
    }
    const temporaryPassword = randomBytes(24).toString('base64url');
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await this.db.$transaction(async tx => {
      const updated = await tx.user.update({
        where: { id: memberId },
        data: { passwordHash, passwordChangeRequired: true,
          temporaryPasswordExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        select: { id: true, email: true, name: true },
      });
      await tx.session.updateMany({ where: { userId: memberId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: { workspaceId, actorId, action: 'PASSWORD_RESET_BY_ADMIN', subjectId: memberId },
      });
      return updated;
    });
    return { user, temporaryPassword };
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

  @Post(':workspaceId/members/provision')
  provisionMember(
    @Req() req: AuthRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() input: ProvisionMemberDto,
  ) {
    return this.workspaces.provisionMember(workspaceId, req.userId, input);
  }

  @Post(':workspaceId/members/:memberId/reset-password')
  resetMemberPassword(
    @Req() req: AuthRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.workspaces.resetMemberPassword(workspaceId, req.userId, memberId);
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
