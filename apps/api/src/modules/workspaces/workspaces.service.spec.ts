import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/database/prisma.service', () => ({
  PrismaService: vi.fn().mockImplementation(() => mockPrisma),
}));

const mockPrisma = {
  workspace: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  workspaceMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '@/database/prisma.service';
import { WorkspaceRole } from '@/common/enums/workspace-role.enum';

describe('WorkspacesService', () => {
  let service: WorkspacesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should throw ConflictException if slug already taken', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });

      await expect(
        service.create('user-1', { name: 'Test', slug: 'test' }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.workspace.create).not.toHaveBeenCalled();
    });

    it('should create workspace and set creator as OWNER', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);
      mockPrisma.workspace.create.mockResolvedValue({
        id: 'ws-1',
        name: 'Test',
        slug: 'test',
        members: [{ role: WorkspaceRole.OWNER }],
      });

      const result = await service.create('user-1', {
        name: 'Test',
        slug: 'test',
      });

      expect(mockPrisma.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            members: {
              create: { userId: 'user-1', role: WorkspaceRole.OWNER },
            },
          }),
        }),
      );
      expect(result).toHaveProperty('id');
    });
  });

  describe('inviteMember', () => {
    it('should throw NotFoundException if user email not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteMember('ws-1', {
          email: 'nobody@test.com',
          role: WorkspaceRole.MEMBER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already a member', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });

      await expect(
        service.inviteMember('ws-1', {
          email: 'existing@test.com',
          role: WorkspaceRole.MEMBER,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should invite member successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
      mockPrisma.workspaceMember.create.mockResolvedValue({
        userId: 'user-2',
        workspaceId: 'ws-1',
        role: WorkspaceRole.MEMBER,
      });

      const result = await service.inviteMember('ws-1', {
        email: 'new@test.com',
        role: WorkspaceRole.MEMBER,
      });

      expect(mockPrisma.workspaceMember.create).toHaveBeenCalledOnce();
      expect(result).toHaveProperty('role', WorkspaceRole.MEMBER);
    });
  });

  describe('removeMember', () => {
    it('should throw ForbiddenException when removing owner', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.OWNER,
      });

      await expect(
        service.removeMember('ws-1', 'owner-id', 'admin-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when removing self', async () => {
      mockPrisma.workspaceMember.findUnique.mockResolvedValue({
        role: WorkspaceRole.MEMBER,
      });

      await expect(
        service.removeMember('ws-1', 'user-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});