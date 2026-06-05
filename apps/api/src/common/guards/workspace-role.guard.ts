import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/database/prisma.service';
import { WorkspaceRole } from '../enums/workspace-role.enum';
import { WORKSPACE_ROLES_KEY } from '../decorators/workspace-roles.decorator';

const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  [WorkspaceRole.OWNER]: 4,
  [WorkspaceRole.ADMIN]: 3,
  [WorkspaceRole.MEMBER]: 2,
  [WorkspaceRole.VIEWER]: 1,
};

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      WORKSPACE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;

    // Always read workspaceId from route params only — never from body
    // Body is not reliably available in guards for SSE/streaming endpoints
    const workspaceId: string | undefined = request.params?.workspaceId;

    if (!userId || !workspaceId) {
      throw new ForbiddenException('Missing user or workspace context');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const userLevel = ROLE_HIERARCHY[membership.role as WorkspaceRole];
    const hasPermission = requiredRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    request.workspaceRole = membership.role;
    return true;
  }
}