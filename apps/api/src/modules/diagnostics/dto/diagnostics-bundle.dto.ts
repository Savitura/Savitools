import { ApiProperty } from '@nestjs/swagger';

/**
 * Response shape for GET /diagnostics/bundle (Savitura/Savitools#506).
 * Safe by construction: metadata, statuses, and booleans only.
 */
export class DiagnosticsBundleDto {
  @ApiProperty({ example: '2026-11-24T20:00:00.000Z' })
  generatedAt!: string;

  @ApiProperty({ example: 'savitools-api' })
  serviceName!: string;

  @ApiProperty({ example: '0.1.0' })
  appVersion!: string;

  @ApiProperty({ example: 'v22.10.2' })
  nodeVersion!: string;

  @ApiProperty({ example: 'linux' })
  platform!: string;

  @ApiProperty({ example: 'x64' })
  arch!: string;

  @ApiProperty({ example: 3600.42 })
  uptimeSeconds!: number;

  @ApiProperty({ example: 12345 })
  pid!: number;

  @ApiProperty({
    description:
      'Presence status of each required secret env var. Values are never included.',
    example: { JWT_SECRET: 'set', ENCRYPTION_SECRET: 'set', DATABASE_URL: 'set' },
  })
  requiredEnvStatus!: Record<string, 'set' | 'missing'>;

  @ApiProperty({
    description: 'Feature flags derived from env presence, not raw values.',
    example: { resend: true, fluxa: false },
  })
  featureFlags!: Record<string, boolean>;

  @ApiProperty({
    description: 'Network configuration with URLs stripped to origin + pathname.',
    example: { stellarNetwork: 'testnet' },
  })
  networkConfig!: Record<string, string>;

  @ApiProperty({
    description:
      'Recent error/log lines, each passed through redactString() before inclusion.',
    type: [String],
  })
  recentErrors!: string[];

  @ApiProperty({
    description: 'Count of substitutions the redactor made.',
    example: 3,
  })
  redactionCount!: number;
}
