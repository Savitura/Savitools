import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateWorkspaceDTO } from './dto/create-workspace.dto';
import { RenameWorkspaceDTO } from './dto/rename-workspace.dto';
import { UpdateWorkspaceDTO } from './dto/update-workspace.dto';
import { ComposerStateSchema } from './composer-state.schema';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceTool } from './workspace-tool.enum';

/** PostgreSQL `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

export interface PaginatedWorkspaces {
  items: Workspace[];
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
  ) {}

  // -------------------------------------------------------------------------
  //  Existing generic workspace methods
  // -------------------------------------------------------------------------

  async getWorkspace(userId: string, tool: WorkspaceTool): Promise<Record<string, unknown>> {
    const workspace = await this.findDefaultWorkspace(userId, tool);
    return workspace?.data ?? {};
  }

  async upsertWorkspace(
    userId: string,
    tool: WorkspaceTool,
    dto: UpdateWorkspaceDTO,
  ): Promise<Record<string, unknown>> {
    const workspace = await this.findDefaultWorkspace(userId, tool);

    if (workspace) {
      workspace.data = dto.data;
      const saved = await this.workspacesRepository.save(workspace);
      return saved.data;
    }

    const created = this.workspacesRepository.create({
      userId,
      tool,
      data: dto.data,
      name: null,
    });

    try {
      const saved = await this.workspacesRepository.save(created);
      return saved.data;
    } catch (error) {
      // A concurrent upsert inserted the default row first. The partial unique
      // index on (user_id, tool) WHERE name IS NULL rejected this insert, which
      // is exactly the invariant we want — fold into the winner instead of
      // surfacing a 500.
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const winner = await this.findDefaultWorkspace(userId, tool);
      if (!winner) {
        throw error;
      }

      winner.data = dto.data;
      const saved = await this.workspacesRepository.save(winner);
      return saved.data;
    }
  }

  async assertTool(tool: string): Promise<WorkspaceTool> {
    if (!Object.values(WorkspaceTool).includes(tool as WorkspaceTool)) {
      throw new NotFoundException(`Unknown workspace tool: ${tool}`);
    }

    return tool as WorkspaceTool;
  }

  // -------------------------------------------------------------------------
  //  Named composer workspace methods
  // ------------------------------------------------------------------------

  async listWorkspaces(
    userId: string,
    tool?: string,
    query?: PaginationQueryDto,
  ): Promise<PaginatedWorkspaces> {
    const where: Record<string, unknown> = { userId };
    if (tool) {
      const workspaceTool = await this.assertTool(tool);
      where.tool = workspaceTool;
    }

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 25;

    const [items, total] = await this.workspacesRepository.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, page, limit, total };
  }

  async createWorkspace(userId: string, dto: CreateWorkspaceDTO): Promise<Workspace> {
    const tool = WorkspaceTool.COMPOSER;
    const name = dto.name.trim();

    await this.assertWorkspaceNameAvailable(userId, tool, name);

    const workspace = this.workspacesRepository.create({
      userId,
      tool,
      name,
      data: dto.data,
    });

    return this.workspacesRepository.save(workspace);
  }

  async getWorkspaceById(userId: string, id: string): Promise<Workspace> {
    return this.findWorkspaceForUser(userId, id);
  }

  async updateWorkspaceData(userId: string, id: string, dto: UpdateWorkspaceDTO): Promise<Workspace> {
    const workspace = await this.findWorkspaceForUser(userId, id);
    workspace.data = dto.data;
    return this.workspacesRepository.save(workspace);
  }

  async renameWorkspace(userId: string, id: string, dto: RenameWorkspaceDTO): Promise<Workspace> {
    const workspace = await this.findWorkspaceForUser(userId, id);
    const newName = dto.name.trim();

    if (workspace.name === newName) {
      return workspace;
    }

    await this.assertWorkspaceNameAvailable(userId, workspace.tool, newName, id);
    workspace.name = newName;

    return this.workspacesRepository.save(workspace);
  }

  async deleteWorkspace(userId: string, id: string): Promise<void> {
    const workspace = await this.findWorkspaceForUser(userId, id);
    await this.workspacesRepository.remove(workspace);
  }

  async duplicateWorkspace(userId: string, id: string): Promise<Workspace> {
    const source = await this.findWorkspaceForUser(userId, id);
    const copyName = `${source.name ?? 'Untitled'} (copy)`;
    const data = JSON.parse(JSON.stringify(source.data)) as Record<string, unknown>;

    return this.createWorkspace(userId, { name: copyName, data });
  }

  async exportWorkspace(userId: string, id: string) {
    const workspace = await this.findWorkspaceForUser(userId, id);

    return {
      id: workspace.id,
      name: workspace.name,
      tool: workspace.tool,
      data: workspace.data,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  async importWorkspace(userId: string, input: CreateWorkspaceDTO): Promise<Workspace> {
    const validationError = ComposerStateSchema.validate(input.data);
    if (validationError) {
      throw new BadRequestException(`Invalid composer data: ${validationError}`);
    }

    return this.createWorkspace(userId, input);
  }

  async shareWorkspace(
    userId: string,
    id: string,
    expiresInDays = 7,
  ): Promise<{ token: string; expiresAt: Date; url: string }> {
    const workspace = await this.findWorkspaceForUser(userId, id);

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    workspace.shareToken = token;
    workspace.shareExpiresAt = expiresAt;

    await this.workspacesRepository.save(workspace);

    return {
      token,
      expiresAt,
      url: `/shared/composer/${token}`,
    };
  }

  async unshareWorkspace(userId: string, id: string): Promise<Workspace> {
    const workspace = await this.findWorkspaceForUser(userId, id);

    workspace.shareToken = null;
    workspace.shareExpiresAt = null;

    return this.workspacesRepository.save(workspace);
  }

  async getSharedWorkspace(token: string): Promise<Workspace> {
    const workspace = await this.workspacesRepository.findOne({
      where: { shareToken: token },
    });

    if (!workspace) {
      throw new NotFoundException('Shared workspace not found');
    }

    if (workspace.shareExpiresAt && workspace.shareExpiresAt < new Date()) {
      throw new NotFoundException('Shared workspace link has expired');
    }

    return workspace;
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private async findWorkspaceForUser(userId: string, id: string): Promise<Workspace> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id, userId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  /**
   * The default workspace is the one whose `name IS NULL` for a (user, tool).
   *
   * Uses `find({ take: 1 })` rather than `findOne` on purpose: on a database
   * that still holds duplicate default rows (pre-dating the partial unique
   * index), `findOne` throws `NonUniqueResultError`, which surfaced as a 500 on
   * this hot path. Returning the oldest row keeps the endpoint working and is
   * what the migration converges to anyway.
   */
  private async findDefaultWorkspace(
    userId: string,
    tool: WorkspaceTool,
  ): Promise<Workspace | null> {
    const [workspace] = await this.workspacesRepository.find({
      where: { userId, tool, name: IsNull() },
      order: { createdAt: 'ASC' },
      take: 1,
    });

    return workspace ?? null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const code = (error as { code?: unknown; driverError?: { code?: unknown } }).code
      ?? (error as { driverError?: { code?: unknown } }).driverError?.code;

    return code === UNIQUE_VIOLATION;
  }

  private async assertWorkspaceNameAvailable(
    userId: string,
    tool: WorkspaceTool,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.workspacesRepository.findOne({
      where: { userId, tool, name },
    });

    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`A workspace named "${name}" already exists`);
    }
  }
}
