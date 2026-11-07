import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { CreateVaultKeyDto } from './dto/create-vault-key.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('vault')
@Controller('vault/keys')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
export class VaultController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @ApiOperation({
    summary: 'Store a named API key in the vault (encrypted at rest)',
    description: 'The raw key is never returned after creation.',
  })
  @ApiResponse({ status: 201, description: 'Key stored, { id, name, provider, createdAt }' })
  @ApiResponse({ status: 400, description: 'Invalid key name, provider, or value' })
  async create(@Body() dto: CreateVaultKeyDto, @CurrentUser() user: { id: string }) {
    return this.authService.createVaultKey(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List stored vault keys by name and provider' })
  async list(@CurrentUser() user: { id: string }) {
    return this.authService.listVaultKeys(user.id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a vault key' })
  @ApiResponse({ status: 404, description: 'Key not found' })
  async remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    await this.authService.deleteVaultKey(id, user.id);
    return { success: true };
  }
}
