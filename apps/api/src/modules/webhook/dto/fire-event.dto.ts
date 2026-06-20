import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class FireEventDto {
  @ApiProperty({
    example: 'transfer.settled',
    description: 'Event type to fire',
  })
  @IsString()
  eventType!: string;
}
