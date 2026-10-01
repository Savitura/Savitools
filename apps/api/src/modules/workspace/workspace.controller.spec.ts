import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceTool } from './workspace-tool.enum';
import { WorkspaceService } from './workspace.service';

const createdAt = new Date('2024-01-01T00:00:00Z');
const updatedAt = new Date('2024-01-02T00:00:00Z');

function workspaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ws-1',
    userId: 'user-1',
    tool: WorkspaceTool.COMPOSER,
    name: 'plan',
    data: { layout: 'grid' },
    createdAt,
    updatedAt,
    shareToken: null,
    shareExpiresAt: null,
    ...overrides,
  };
}

function makeService() {
  return {
    listWorkspaces: jest.fn(),
    createWorkspace: jest.fn(),
    getWorkspaceById: jest.fn(),
    updateWorkspaceData: jest.fn(),
    renameWorkspace: jest.fn(),
    deleteWorkspace: jest.fn(),
    duplicateWorkspace: jest.fn(),
    exportWorkspace: jest.fn(),
    importWorkspace: jest.fn(),
    shareWorkspace: jest.fn(),
    unshareWorkspace: jest.fn(),
    assertTool: jest.fn(),
    getWorkspace: jest.fn(),
    upsertWorkspace: jest.fn(),
  };
}

describe('WorkspaceController', () => {
  let service: ReturnType<typeof makeService>;
  let controller: WorkspaceController;

  beforeEach(() => {
    service = makeService();
    controller = new WorkspaceController(service as unknown as WorkspaceService);
  });

  describe('listWorkspaces', () => {
    it('returns the paginated envelope and forwards the query to the service', async () => {
      service.listWorkspaces.mockResolvedValue({
        items: [workspaceRow()],
        page: 2,
        limit: 10,
        total: 21,
      });

      const result = await controller.listWorkspaces(
        { id: 'user-1' },
        'composer',
        Object.assign(new PaginationQueryDto(), { page: 2, limit: 10 }),
      );

      expect(service.listWorkspaces).toHaveBeenCalledWith(
        'user-1',
        'composer',
        expect.objectContaining({ page: 2, limit: 10 }),
      );
      expect(result).toEqual({
        workspaces: [
          { id: 'ws-1', name: 'plan', tool: WorkspaceTool.COMPOSER, createdAt, updatedAt },
        ],
        page: 2,
        limit: 10,
        total: 21,
      });
      // `data` is deliberately not part of a list summary.
      expect(result.workspaces[0]).not.toHaveProperty('data');
    });

    it('defaults to the shared pagination when no query is supplied', async () => {
      service.listWorkspaces.mockResolvedValue({ items: [], page: 1, limit: 25, total: 0 });

      await expect(
        controller.listWorkspaces({ id: 'user-1' }, undefined, new PaginationQueryDto()),
      ).resolves.toEqual({ workspaces: [], page: 1, limit: 25, total: 0 });
    });
  });

  it('creates a composer workspace and returns it with data', async () => {
    service.createWorkspace.mockResolvedValue(workspaceRow());

    await expect(
      controller.createComposerWorkspace(
        { id: 'user-1' },
        { name: 'plan', data: { layout: 'grid' } },
      ),
    ).resolves.toMatchObject({ id: 'ws-1', data: { layout: 'grid' } });
  });

  it('returns the tool state for the generic workspace endpoints', async () => {
    service.assertTool.mockResolvedValue(WorkspaceTool.SANDBOX);
    service.getWorkspace.mockResolvedValue({ saved: true });
    service.upsertWorkspace.mockResolvedValue({ saved: true });

    await expect(controller.getWorkspace({ id: 'user-1' }, 'sandbox')).resolves.toEqual({
      tool: WorkspaceTool.SANDBOX,
      data: { saved: true },
    });

    await expect(
      controller.upsertWorkspace({ id: 'user-1' }, 'sandbox', { data: { saved: true } }),
    ).resolves.toEqual({ tool: WorkspaceTool.SANDBOX, data: { saved: true } });
  });

  it('exports a workspace through the service', async () => {
    service.exportWorkspace.mockResolvedValue({ id: 'ws-1', name: 'plan' });

    await expect(controller.exportComposerWorkspace({ id: 'user-1' }, 'ws-1')).resolves.toEqual({
      id: 'ws-1',
      name: 'plan',
    });
    expect(service.exportWorkspace).toHaveBeenCalledWith('user-1', 'ws-1');
  });

  it('returns the share link from the service', async () => {
    const share = { token: 'abc', expiresAt: updatedAt, url: '/shared/composer/abc' };
    service.shareWorkspace.mockResolvedValue(share);

    await expect(controller.shareComposerWorkspace({ id: 'user-1' }, 'ws-1')).resolves.toEqual(
      share,
    );
  });

  it('reports deletion success without leaking the removed row', async () => {
    service.deleteWorkspace.mockResolvedValue(undefined);

    await expect(controller.deleteComposerWorkspace({ id: 'user-1' }, 'ws-1')).resolves.toEqual({
      success: true,
    });
    expect(service.deleteWorkspace).toHaveBeenCalledWith('user-1', 'ws-1');
  });
});
