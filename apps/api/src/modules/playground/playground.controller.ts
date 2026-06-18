import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProxyRequestDto } from './dto/proxy-request.dto';
import { SaveApiKeyDto } from './dto/save-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
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
  async getSpec(@Param('provider') provider: ApiKeyProvider) {
    const spec = await this.playgroundService.getSpec(provider);
    return { provider, spec };
  }

  @Post('proxy')
  @ApiOperation({ summary: 'Proxy a request to the target API with server-side auth' })
  async proxy(@CurrentUser() user: { id: string }, @Body() dto: ProxyRequestDto) {
    return this.playgroundService.proxyRequest(user.id, dto);
  }

  @Post('keys')
  @ApiOperation({ summary: 'Save an encrypted API key' })
  async saveKey(@CurrentUser() user: { id: string }, @Body() dto: SaveApiKeyDto) {
    return this.playgroundService.saveKey(user.id, dto);
  }

  @Get('keys')
  @ApiOperation({ summary: 'List stored API keys (masked)' })
  async listKeys(@CurrentUser() user: { id: string }) {
    return this.playgroundService.listKeys(user.id);
  }

  @Put('keys/:id')
  @ApiOperation({ summary: 'Update a stored API key' })
  async updateKey(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ) {
    return this.playgroundService.updateKey(id, user.id, dto);
  }

  @Delete('keys/:id')
  @ApiOperation({ summary: 'Delete a stored API key' })
  async deleteKey(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.playgroundService.deleteKey(id, user.id);
    return { success: true };
  }
}
