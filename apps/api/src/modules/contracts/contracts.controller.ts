import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ContractsService } from './contracts.service';
import { InvokeContractDto } from './dto/invoke-contract.dto';
import { DeployContractDto } from './dto/deploy-contract.dto';

@ApiTags('contracts')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('deploy')
  @ApiOperation({ summary: 'Deploy a Soroban smart contract from a WASM file' })
  @ApiConsumes('multipart/form-data')
  async deploy(@Req() req: FastifyRequest) {
    const file = await req.file();

    if (!file) {
      throw new BadRequestException('WASM file is required');
    }

    const mimetype = file.mimetype;
    if (mimetype !== 'application/wasm' && mimetype !== 'application/octet-stream' && !file.filename.endsWith('.wasm')) {
      throw new BadRequestException('Uploaded file must be a .wasm file');
    }

    const wasmBuffer = await file.toBuffer();

    const argsField = file.fields.args as { value?: string } | undefined;
    const constructorArgs: unknown[] | undefined = argsField?.value
      ? this.parseArgs(argsField.value)
      : undefined;

    return this.contractsService.deploy(wasmBuffer, constructorArgs);
  }

  @Post(':contractId/invoke')
  @ApiOperation({ summary: 'Invoke a contract function' })
  async invoke(
    @Param('contractId') contractId: string,
    @Body() dto: InvokeContractDto,
  ) {
    return this.contractsService.invoke(contractId, dto.functionName, dto.args);
  }

  @Get(':contractId/info')
  @ApiOperation({ summary: 'Get contract metadata from the network' })
  async getInfo(@Param('contractId') contractId: string) {
    return this.contractsService.getInfo(contractId);
  }

  private parseArgs(raw: string): unknown[] {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new BadRequestException('Constructor args must be a JSON array');
      }
      return parsed;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Invalid JSON in args field');
    }
  }
}
