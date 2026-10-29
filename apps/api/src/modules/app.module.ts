import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController, AuthService, SessionGuard } from './auth';
import { DatabaseService } from './database';
import { HealthController } from './health';
import { WorkspaceController, WorkspaceService } from './workspaces';
import { TaskController, TaskService } from './tasks';
import { AnnotationController, AnnotationService } from './annotations';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [HealthController, AuthController, WorkspaceController, TaskController, AnnotationController],
  providers: [
    DatabaseService, AuthService, SessionGuard,
    WorkspaceService, TaskService, AnnotationService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
