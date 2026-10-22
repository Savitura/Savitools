import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';

@ApiTags('shared composer')
@Controller('shared/composer')
export class SharedComposerController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read a shared composer workspace' })
  @ApiResponse({ status: 200, description: 'Shared composer workspace' })
  @ApiResponse({ status: 404, description: 'Share link not found or expired' })
  async getSharedComposerWorkspace(@Param('token') token: string) {
    const workspace = await this.workspaceService.getSharedWorkspace(token);

    return {
      id: workspace.id,
      name: workspace.name,
      tool: workspace.tool,
      data: workspace.data,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }
}