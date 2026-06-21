import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DecodeXdrDto } from './dto/decode-xdr.dto';
import { InspectorService } from './inspector.service';

@ApiTags('inspector')
@Controller('inspector')
export class InspectorController {
  constructor(private readonly inspectorService: InspectorService) {}

  @Get('tx/:hash')
  @ApiOperation({ summary: 'Fetch and decode a transaction by hash' })
  @ApiParam({ name: 'hash', description: 'Transaction hash (64 hex chars)' })
  @ApiQuery({ name: 'network', required: false, enum: ['testnet', 'mainnet'] })
  inspectTransaction(
    @Param('hash') hash: string,
    @Query('network') network?: 'testnet' | 'mainnet',
  ) {
    return this.inspectorService.inspectTransaction(hash, network ?? 'testnet');
  }

  @Get('account/:publicKey/txs')
  @ApiOperation({ summary: 'Last 20 transactions for a Stellar account' })
  @ApiParam({ name: 'publicKey', description: 'Stellar public key (G…)' })
  @ApiQuery({ name: 'network', required: false, enum: ['testnet', 'mainnet'] })
  getAccountTransactions(
    @Param('publicKey') publicKey: string,
    @Query('network') network?: 'testnet' | 'mainnet',
  ) {
    return this.inspectorService.getAccountTransactions(publicKey, network ?? 'testnet');
  }

  @Post('decode-xdr')
  @ApiOperation({ summary: 'Decode raw XDR (offline, no Horizon call)' })
  decodeXdr(@Body() dto: DecodeXdrDto) {
    return this.inspectorService.decodeXdr(dto.xdr, dto.network ?? 'testnet');
  }
}
