import { Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
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

  @Get('tx/:hash/export')
  @ApiOperation({
    summary: 'Export a transaction breakdown as CSV (UTF-8 BOM for Excel)',
  })
  @ApiParam({ name: 'hash', description: 'Transaction hash (64 hex chars)' })
  @ApiQuery({ name: 'network', required: false, enum: ['testnet', 'mainnet'] })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportTransaction(
    @Param('hash') hash: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('network') network?: 'testnet' | 'mainnet',
  ) {
    const breakdown = await this.inspectorService.inspectTransaction(
      hash,
      network ?? 'testnet',
    );
    reply.header(
      'Content-Disposition',
      `attachment; filename="transaction-${hash.slice(0, 12)}.csv"`,
    );
    return this.inspectorService.exportTransactionCsv(breakdown);
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
