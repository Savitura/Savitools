import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListHistoryDto } from './dto/list-history.dto';
import { ProxyRequestDto } from './dto/proxy-request.dto';
import { SaveApiKeyDto } from './dto/save-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ImportProviderDto, RenameProviderDto } from './dto/import-provider.dto';
import { ApiKeyProvider } from './entities/api-key.entity';
import { PlaygroundService } from './playground.service';

@ApiTags('playground')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('playground')
export class PlaygroundController {
  constructor(private readonly playgroundService: PlaygroundService) {}

  @Get('spec/:provider')
  @ApiOperation({ summary: 'Fetch and cache an OpenAPI spec for a provider' })
  @ApiParam({ name: 'provider', enum: ApiKeyProvider })
  @ApiResponse({ status: 200, description: 'OpenAPI spec retrieved' })
  @ApiResponse({ status: 404, description: 'Provider spec not found' })
  async getSpec(@Param('provider') provider: ApiKeyProvider) {
    const spec = await this.playgroundService.getSpec(provider);
    return { provider, spec };
  }

  @Post('proxy')
  @ApiOperation({ summary: 'Proxy a request to the target API with server-side auth' })
  @ApiResponse({ status: 200, description: 'Proxied request successful' })
  @ApiResponse({ status: 400, description: 'Invalid proxy request' })
  async proxy(@CurrentUser() user: { id: string }, @Body() dto: ProxyRequestDto) {
    return this.playgroundService.proxyRequest(user.id, dto);
  }

  @Post('keys')
  @ApiOperation({ summary: 'Save an encrypted API key' })
  @ApiResponse({ status: 201, description: 'API key saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid API key data' })
  async saveKey(@CurrentUser() user: { id: string }, @Body() dto: SaveApiKeyDto) {
    return this.playgroundService.saveKey(user.id, dto);
  }

  @Get('keys')
  @ApiOperation({ summary: 'List stored API keys (masked)' })
  @ApiResponse({ status: 200, description: 'API keys retrieved' })
  async listKeys(@CurrentUser() user: { id: string }) {
    return this.playgroundService.listKeys(user.id);
  }

  @Put('keys/:id')
  @ApiOperation({ summary: 'Update a stored API key' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'API key updated successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async updateKey(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    return this.playgroundService.updateKey(id, user.id, dto);
  }

  @Delete('keys/:id')
  @ApiOperation({ summary: 'Delete a stored API key' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 204, description: 'API key deleted successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async deleteKey(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.playgroundService.deleteKey(id, user.id);
    return { success: true };
  }

  @Post('providers/import')
  @ApiOperation({ summary: 'Import a custom OpenAPI provider' })
  @ApiResponse({ status: 201, description: 'Provider imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid OpenAPI document or key' })
  async importProvider(@CurrentUser() user: { id: string }, @Body() dto: ImportProviderDto) {
    return this.playgroundService.importProvider(user.id, dto);
  }

  @Get('providers')
  @ApiOperation({ summary: 'List all providers for the current user' })
  @ApiResponse({ status: 200, description: 'Providers retrieved' })
  async listProviders(@CurrentUser() user: { id: string }) {
    return this.playgroundService.listProviders(user.id);
  }

  @Put('providers/:id/rename')
  @ApiOperation({ summary: 'Rename a provider' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'Provider renamed successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async renameProvider(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: RenameProviderDto,
  ) {
    return this.playgroundService.renameProvider(id, user.id, dto);
  }

  @Delete('providers/:id')
  @ApiOperation({ summary: 'Delete a provider' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 204, description: 'Provider deleted successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async deleteProvider(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.playgroundService.deleteProvider(id, user.id);
    return { success: true };
  }

  @Get('history')
  @ApiOperation({ summary: 'List past proxied requests for the current user' })
  @ApiResponse({ status: 200, description: 'Request history retrieved' })
  async listHistory(@CurrentUser() user: { id: string }, @Query() query: ListHistoryDto) {
    return this.playgroundService.listHistory(user.id, query);
  }

  @Get('history/diff')
  @ApiOperation({ summary: 'Diff the responses of two history entries' })
  @ApiQuery({ name: 'a', description: 'First history entry ID' })
  @ApiQuery({ name: 'b', description: 'Second history entry ID' })
  @ApiResponse({ status: 200, description: 'Diff computed successfully' })
  @ApiResponse({ status: 404, description: 'History entry not found' })
  async diffHistory(
    @CurrentUser() user: { id: string },
    @Query('a') a: string,
    @Query('b') b: string,
  ) {
    if (!a || !b) {
      throw new BadRequestException('Both "a" and "b" history entry IDs are required');
    }
    const diff = await this.playgroundService.diffHistory(a, b, user.id);
    return { a, b, diff };
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'Fetch a single history entry' })
  @ApiParam({ name: 'id', description: 'History entry ID' })
  @ApiResponse({ status: 200, description: 'History entry retrieved' })
  @ApiResponse({ status: 404, description: 'History entry not found' })
  async getHistoryEntry(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.playgroundService.getHistoryEntry(id, user.id);
  }
}
