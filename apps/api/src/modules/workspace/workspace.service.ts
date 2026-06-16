import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceTool } from './workspace-tool.enum';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
  ) {}

  async getWorkspace(userId: string, tool: WorkspaceTool): Promise<Record<string, unknown>> {
    const workspace = await this.workspacesRepository.findOne({
      where: { userId, tool },
    });

    return workspace?.data ?? {};
  }

  async upsertWorkspace(
    userId: string,
    tool: WorkspaceTool,
    dto: UpdateWorkspaceDto,
  ): Promise<Record<string, unknown>> {
    let workspace = await this.workspacesRepository.findOne({
      where: { userId, tool },
    });

    if (workspace) {
      workspace.data = dto.data;
    } else {
      workspace = this.workspacesRepository.create({
        userId,
        tool,
        data: dto.data,
      });
    }

    const saved = await this.workspacesRepository.save(workspace);
    return saved.data;
  }

  async assertTool(tool: string): Promise<WorkspaceTool> {
    if (!Object.values(WorkspaceTool).includes(tool as WorkspaceTool)) {
      throw new NotFoundException(`Unknown workspace tool: ${tool}`);
    }

    return tool as WorkspaceTool;
  }
}
