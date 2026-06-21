import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspaces')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get(':tool')
  @ApiOperation({ summary: 'Get persisted tool state for the current user' })
  @ApiParam({
    name: 'tool',
    enum: ['sandbox', 'inspector', 'webhooks', 'composer'],
  })
  @ApiResponse({ status: 200, description: 'Tool workspace retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid tool name' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async getWorkspace(
    @CurrentUser() user: { id: string },
    @Param('tool') tool: string,
  ) {
    const workspaceTool = await this.workspaceService.assertTool(tool);
    const data = await this.workspaceService.getWorkspace(user.id, workspaceTool);

    return { tool: workspaceTool, data };
  }

  @Put(':tool')
  @ApiOperation({ summary: 'Save tool state for the current user' })
  @ApiParam({
    name: 'tool',
    enum: ['sandbox', 'inspector', 'webhooks', 'composer'],
  })
  @ApiResponse({ status: 200, description: 'Tool workspace saved' })
  @ApiResponse({ status: 400, description: 'Invalid tool name or data' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async upsertWorkspace(
    @CurrentUser() user: { id: string },
    @Param('tool') tool: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    const workspaceTool = await this.workspaceService.assertTool(tool);
    const data = await this.workspaceService.upsertWorkspace(user.id, workspaceTool, dto);

    return { tool: workspaceTool, data };
  }
}
