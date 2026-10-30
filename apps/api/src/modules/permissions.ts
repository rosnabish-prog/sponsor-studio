import { ForbiddenException } from '@nestjs/common';
import type { WorkspaceRole } from '../generated/prisma/client';

export function mustManage(role: WorkspaceRole): void {
  if (role !== 'OWNER' && role !== 'ADMIN') throw new ForbiddenException('Administrator permission required');
}

export function canAccessTask(
  role: WorkspaceRole,
  userId: string,
  sponsorAnalystId: string | null,
  contextAnalystId: string | null,
): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'REVIEWER' || role === 'VIEWER' ||
    sponsorAnalystId === userId || contextAnalystId === userId;
}

export function mayEditStream(
  role: WorkspaceRole,
  userId: string,
  analystId: string | null,
  submittedAt: Date | null,
): boolean {
  return submittedAt === null && (role === 'OWNER' || role === 'ADMIN' || (role === 'ANALYST' && analystId === userId));
}

export function checkAnnotationTimes(start: number, end: number | null, duration: number): void {
  if (!Number.isFinite(start) || start < 0 || (duration > 0 && start > duration)) {
    throw new RangeError('Annotation start must be inside the video');
  }
  if (end !== null && (!Number.isFinite(end) || end <= start || (duration > 0 && end > duration))) {
    throw new RangeError('Annotation end must be after start and inside the video');
  }
}
