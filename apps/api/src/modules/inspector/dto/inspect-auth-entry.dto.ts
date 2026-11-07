import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class InspectAuthEntryDto {
  @ApiProperty({
    description: 'Raw SorobanAuthorizationEntry XDR base64 string or JSON structure',
  })
  @IsNotEmpty()
  xdr: string | string[] | Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Current ledger sequence used to check expiration',
  })
  @IsOptional()
  ledger?: number;
}
