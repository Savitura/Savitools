import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspaceTool } from './workspace-tool.enum';
import { WorkspaceService } from './workspace.service';

interface Row {
  id: string;
  userId: string;
  tool: WorkspaceTool;
  name: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

const isNullOperator = (value: unknown): boolean =>
  Boolean(value && typeof value === 'object' && (value as { type?: string }).type === 'isNull');

/**
 * In-memory stand-in for the TypeORM repository that also enforces the partial
 * unique index (`(user_id, tool) WHERE name IS NULL`) introduced for #254, so
 * the concurrent-write test exercises the real conflict path rather than a
 * mocked return value.
 */
function fakeRepo(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  let sequence = 0;

  const matches = (row: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) =>
      isNullOperator(value)
        ? (row as unknown as Record<string, unknown>)[key] === null
        : (row as unknown as Record<string, unknown>)[key] === value,
    );

  const insert = (entity: Row): Row => {
    if (entity.name === null) {
      const clash = rows.find(
        (row) => row.userId === entity.userId && row.tool === entity.tool && row.name === null,
      );
      if (clash) {
        const error = new Error(
          'duplicate key value violates unique constraint "UQ_workspaces_user_tool_default"',
        ) as Error & { code: string };
        error.code = '23505';
        throw error;
      }
    }
    rows.push(entity);
    return entity;
  };

  return {
    rows,
    find: jest.fn(async (options: { where?: Record<string, unknown>; take?: number; skip?: number; order?: unknown } = {}) => {
      let result = rows.filter((row) => matches(row, options.where));
      if (options.skip) result = result.slice(options.skip);
      if (options.take !== undefined) result = result.slice(0, options.take);
      return result;
    }),
    findAndCount: jest.fn(async (options: { where?: Record<string, unknown>; take?: number; skip?: number } = {}) => {
      const all = rows.filter((row) => matches(row, options.where));
      let page = all;
      if (options.skip) page = page.slice(options.skip);
      if (options.take !== undefined) page = page.slice(0, options.take);
      return [page, all.length];
    }),
    findOne: jest.fn(async (options: { where?: Record<string, unknown> } = {}) =>
      rows.find((row) => matches(row, options.where)) ?? null,
    ),
    create: jest.fn((dto: Partial<Row>) => ({
      id: `ws-${++sequence}`,
      createdAt: new Date(1_700_000_000_000 + sequence),
      ...dto,
    }) as Row),
    save: jest.fn(async (entity: Row) => {
      const index = rows.findIndex((row) => row.id === entity.id);
      if (index >= 0) {
        rows[index] = entity;
        return entity;
      }
      return insert(entity);
    }),
    remove: jest.fn(async (entity: Row) => {
      const index = rows.findIndex((row) => row.id === entity.id);
      if (index >= 0) rows.splice(index, 1);
      return entity;
    }),
  };
}

function defaultRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'ws-default',
    userId: 'user-1',
    tool: WorkspaceTool.SANDBOX,
    name: null,
    data: { key: 'value' },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let repo: ReturnType<typeof fakeRepo>;

  beforeEach(() => {
    repo = fakeRepo();
    service = new WorkspaceService(repo as never);
  });

  describe('getWorkspace', () => {
    it('returns workspace data when found', async () => {
      repo = fakeRepo([defaultRow()]);
      service = new WorkspaceService(repo as never);

      await expect(service.getWorkspace('user-1', WorkspaceTool.SANDBOX)).resolves.toEqual({
        key: 'value',
      });
    });

    it('returns an empty object when not found', async () => {
      await expect(service.getWorkspace('user-1', WorkspaceTool.INSPECTOR)).resolves.toEqual({});
    });

    it('resolves a pre-existing duplicate to the oldest row instead of throwing', async () => {
      repo = fakeRepo([
        defaultRow({ id: 'ws-old', data: { kept: true }, createdAt: new Date('2024-01-01T00:00:00Z') }),
        defaultRow({ id: 'ws-new', data: { dropped: true }, createdAt: new Date('2024-06-01T00:00:00Z') }),
      ]);
      service = new WorkspaceService(repo as never);

      await expect(service.getWorkspace('user-1', WorkspaceTool.SANDBOX)).resolves.toEqual({
        kept: true,
      });
    });
  });

  describe('upsertWorkspace', () => {
    it('creates a new default workspace when none exists', async () => {
      const result = await service.upsertWorkspace('user-1', WorkspaceTool.COMPOSER, {
        data: { layout: 'grid' },
      });

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        tool: WorkspaceTool.COMPOSER,
        data: { layout: 'grid' },
        name: null,
      });
      expect(result).toEqual({ layout: 'grid' });
    });

    it('updates an existing default workspace', async () => {
      repo = fakeRepo([defaultRow({ tool: WorkspaceTool.COMPOSER, data: { layout: 'list' } })]);
      service = new WorkspaceService(repo as never);

      const result = await service.upsertWorkspace('user-1', WorkspaceTool.COMPOSER, {
        data: { layout: 'grid' },
      });

      expect(result).toEqual({ layout: 'grid' });
      expect(repo.rows).toHaveLength(1);
    });

    it('keeps exactly one default row when two writes race', async () => {
      const [first, second] = await Promise.all([
        service.upsertWorkspace('user-1', WorkspaceTool.SANDBOX, { data: { writer: 'a' } }),
        service.upsertWorkspace('user-1', WorkspaceTool.SANDBOX, { data: { writer: 'b' } }),
      ]);

      const defaults = repo.rows.filter(
        (row) => row.userId === 'user-1' && row.tool === WorkspaceTool.SANDBOX && row.name === null,
      );
      expect(defaults).toHaveLength(1);
      // Both callers succeeded; the loser folded into the winner's row.
      expect([first, second]).toEqual(
        expect.arrayContaining([{ writer: 'a' }, { writer: 'b' }]),
      );
      expect(defaults[0].data).toEqual(expect.objectContaining({ writer: expect.any(String) }));
    });

    it('rethrows a non-unique save failure', async () => {
      repo.save.mockRejectedValueOnce(new Error('connection terminated'));

      await expect(
        service.upsertWorkspace('user-1', WorkspaceTool.SANDBOX, { data: {} }),
      ).rejects.toThrow('connection terminated');
    });
  });

  describe('listWorkspaces', () => {
    it('paginates using the shared pagination DTO', async () => {
      repo = fakeRepo([
        defaultRow({ id: 'ws-1', tool: WorkspaceTool.COMPOSER, name: 'one' }),
        defaultRow({ id: 'ws-2', tool: WorkspaceTool.COMPOSER, name: 'two' }),
        defaultRow({ id: 'ws-3', tool: WorkspaceTool.COMPOSER, name: 'three' }),
        defaultRow({ id: 'ws-4', tool: WorkspaceTool.COMPOSER, name: 'four' }),
        defaultRow({ id: 'ws-5', tool: WorkspaceTool.COMPOSER, name: 'five' }),
      ]);
      service = new WorkspaceService(repo as never);

      const result = await service.listWorkspaces('user-1', undefined, {
        page: 2,
        limit: 2,
      });

      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(2);
      expect(result.items.map((item) => item.id)).toEqual(['ws-3', 'ws-4']);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 2, take: 2 }),
      );
    });

    it('applies the shared defaults when no query is supplied', async () => {
      repo = fakeRepo([defaultRow({ tool: WorkspaceTool.INSPECTOR })]);
      service = new WorkspaceService(repo as never);

      const result = await service.listWorkspaces('user-1');

      expect(result).toMatchObject({ page: 1, limit: 25, total: 1 });
    });

    it('narrows by tool and rejects an unknown one', async () => {
      repo = fakeRepo([
        defaultRow({ id: 'ws-a', tool: WorkspaceTool.INSPECTOR }),
        defaultRow({ id: 'ws-b', tool: WorkspaceTool.SANDBOX }),
      ]);
      service = new WorkspaceService(repo as never);

      const result = await service.listWorkspaces('user-1', 'inspector');
      expect(result.items.map((item) => item.id)).toEqual(['ws-a']);
      expect(result.total).toBe(1);

      await expect(service.listWorkspaces('user-1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertTool', () => {
    it('returns valid tool names', async () => {
      expect(await service.assertTool('sandbox')).toBe(WorkspaceTool.SANDBOX);
      expect(await service.assertTool('inspector')).toBe(WorkspaceTool.INSPECTOR);
      expect(await service.assertTool('webhooks')).toBe(WorkspaceTool.WEBHOOKS);
      expect(await service.assertTool('composer')).toBe(WorkspaceTool.COMPOSER);
    });

    it('throws NotFoundException for invalid tool names', async () => {
      await expect(service.assertTool('invalid')).rejects.toThrow(NotFoundException);
      await expect(service.assertTool('')).rejects.toThrow(NotFoundException);
    });
  });

  describe('named workspaces', () => {
    it('rejects a duplicate name for the same tool', async () => {
      repo = fakeRepo([
        defaultRow({ id: 'ws-1', tool: WorkspaceTool.COMPOSER, name: 'plan' }),
      ]);
      service = new WorkspaceService(repo as never);

      await expect(
        service.createWorkspace('user-1', { name: 'plan', data: {} }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
