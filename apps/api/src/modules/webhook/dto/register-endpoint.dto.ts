import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUrl } from 'class-validator';

export class RegisterEndpointDto {
  @ApiProperty({ example: 'https://webhook.site/abc-123', description: 'Your webhook endpoint URL' })
  @IsString()
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({
    example: ['contribution.created', 'transfer.settled'],
    description: 'Event types to subscribe to',
  })
  @IsArray()
  @IsString({ each: true })
  events!: string[];
}
