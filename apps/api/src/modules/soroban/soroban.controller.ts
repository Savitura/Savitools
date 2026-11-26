import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SorobanService } from './soroban.service';
import {
  EstimateExpirationDto,
  ExtendTtlEstimateDto,
  BulkEstimateDto,
  ExpirationEstimateResponseDto,
  TtlExtensionEstimateResponseDto,
  BulkExpirationResultResponseDto,
} from './dto/estimate-expiration.dto';

@ApiTags('soroban')
@Controller('soroban')
export class SorobanController {
  constructor(private readonly sorobanService: SorobanService) {}

  @Post('estimate-expiration')
  @ApiOperation({
    summary: 'Estimate Soroban contract storage entry expiration date and TTL status',
    description:
      'Calculates the remaining TTL (in ledgers, seconds, minutes, hours, and days) and projected calendar expiration date for a Soroban contract storage entry.\n\n' +
      '### Soroban Storage Durability Types:\n' +
      '- **`persistent`**: Long-lived contract state (balances, allowances, protocol configs). Billed at full rent (1.0x). When expired, the entry is moved to archive state and can be recovered using a `RestoreFootprintOp` transaction before extending TTL with `ExtendFootprintTTLOp`.\n' +
      '- **`temporary`**: Ephemeral contract state (nonces, short-lived authorization flags). Billed at discounted rent (0.5x). When expired, the entry is **permanently destroyed** and **cannot be restored**.\n' +
      '- **`instance`**: Storage coupled to the contract instance (WASM bytecode and instance data). Governed by instance TTL; if expired, contract invocations will fail until restored/extended.\n\n' +
      '### RPC Configuration & Prerequisites:\n' +
      '- `currentLedger`: Latest ledger sequence closed on the network, obtained via Soroban RPC `getLatestLedger` or Horizon `/ledgers`.\n' +
      '- `liveUntilLedger`: Ledger number when the entry expires, obtained from the `liveUntilLedgerSeq` field in Soroban RPC `getLedgerEntries` response metadata.\n' +
      '- The calculation runs locally and deterministically using average ledger close time (default 5.0 seconds).',
  })
  @ApiResponse({
    status: 200,
    description: 'Expiration estimate and actionable recommendations calculated successfully.',
    type: ExpirationEstimateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters (e.g. negative ledger sequence numbers).',
  })
  estimateExpiration(@Body() dto: EstimateExpirationDto) {
    return this.sorobanService.estimateExpiration(dto);
  }

  @Post('estimate-ttl-extension')
  @ApiOperation({
    summary: 'Estimate the rent cost and lifetime impact of extending a Soroban storage entry TTL',
    description:
      'Calculates the new TTL, extended lifetime in days, and estimated network rent fees (in stroops and XLM) for extending a Soroban storage entry via `ExtendFootprintTTLOp`.\n\n' +
      '### Cost Estimation Protocol Model:\n' +
      '- **Rent Fee**: Calculated as `sizeBytes * extendByLedgers * 0.001 stroops * multiplier`, where `multiplier` is `1.0` for persistent/instance storage and `0.5` for temporary storage.\n' +
      '- **Write Fee Base**: Fixed base write fee of `10,000 stroops` (0.001 XLM) per operation footprint.\n' +
      '- **Recommendations**: Provides guidance on optimal extension horizons (e.g., 90+ days for persistent entries to minimize transaction overhead; warnings against over-extending temporary entries).\n\n' +
      '### Requirements:\n' +
      '- `currentTtl`: Current remaining TTL in ledgers (non-negative).\n' +
      '- `extendByLedgers`: Number of ledgers to extend (minimum 1). 1 day ≈ 17,280 ledgers; 30 days ≈ 518,400 ledgers; 90 days ≈ 1,555,200 ledgers.',
  })
  @ApiResponse({
    status: 200,
    description: 'TTL extension fees and duration impact calculated successfully.',
    type: TtlExtensionEstimateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters (e.g. negative currentTtl or extendByLedgers < 1).',
  })
  estimateTtlExtension(@Body() dto: ExtendTtlEstimateDto) {
    return this.sorobanService.estimateTtlExtension(dto);
  }

  @Post('bulk-estimate')
  @ApiOperation({
    summary: 'Estimate TTL and expiration status for multiple contract addresses',
    description:
      'Queries network infrastructure to retrieve ledger status and evaluate TTL health across multiple Soroban contract addresses in a single request.\n\n' +
      '### Network & RPC Configuration Requirements:\n' +
      '- Uses the configured Stellar Horizon endpoint for the specified network:\n' +
      '  - `testnet`: `STELLAR_HORIZON_URL` (defaults to `https://horizon-testnet.stellar.org`)\n' +
      '  - `mainnet`: `STELLAR_HORIZON_MAINNET_URL` (defaults to `https://horizon.stellar.org`)\n' +
      '- Requires an active internet connection to the configured Horizon / Soroban RPC host.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk TTL estimation results returned for all submitted contract addresses.',
    type: [BulkExpirationResultResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input parameters (e.g. empty contract address array or invalid network).',
  })
  bulkEstimate(@Body() dto: BulkEstimateDto) {
    return this.sorobanService.estimateBulkExpiration(dto);
  }
}
