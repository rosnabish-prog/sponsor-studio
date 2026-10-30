import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController, AuthService, SessionGuard } from './auth';
import { DatabaseService } from './database';
import { HealthController } from './health';
import { WorkspaceController, WorkspaceService } from './workspaces';
import { TaskController, TaskService } from './tasks';
import { AnnotationController, AnnotationService } from './annotations';
import { VideoController, VideoService } from './video';
import { FixtureController } from './fixtures';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [HealthController, AuthController, WorkspaceController, TaskController, AnnotationController, VideoController, FixtureController],
  providers: [
    DatabaseService, AuthService, SessionGuard,
    WorkspaceService, TaskService, AnnotationService, VideoService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
