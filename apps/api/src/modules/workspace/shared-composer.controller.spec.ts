import { NotFoundException } from '@nestjs/common';
import { SharedComposerController } from './shared-composer.controller';
import { WorkspaceTool } from './workspace-tool.enum';
import { WorkspaceService } from './workspace.service';

describe('SharedComposerController', () => {
  const workspaceService = {
    getSharedWorkspace: jest.fn(),
  };
  const controller = new SharedComposerController(
    workspaceService as unknown as WorkspaceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only the public composer workspace fields for a valid token', async () => {
    workspaceService.getSharedWorkspace.mockResolvedValue({
      id: 'workspace-id',
      userId: 'private-user-id',
      name: 'Payment plan',
      tool: WorkspaceTool.COMPOSER,
      data: { sourceAccount: 'GABC', operations: [] },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      shareToken: 'private-token',
      shareExpiresAt: new Date('2026-01-09T00:00:00Z'),
    });

    await expect(controller.getSharedComposerWorkspace('public-token')).resolves.toEqual({
      id: 'workspace-id',
      name: 'Payment plan',
      tool: WorkspaceTool.COMPOSER,
      data: { sourceAccount: 'GABC', operations: [] },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    expect(workspaceService.getSharedWorkspace).toHaveBeenCalledWith('public-token');
  });

  it('propagates missing or expired token failures', async () => {
    workspaceService.getSharedWorkspace.mockRejectedValue(
      new NotFoundException('Shared workspace not found'),
    );

    await expect(controller.getSharedComposerWorkspace('invalid-token')).rejects.toThrow(
      NotFoundException,
    );
  });
});