import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class FluxaDto {
  @ApiProperty({ description: 'Fluxa API key used to link accounts' })
  @IsString()
  @MinLength(1)
  apiKey!: string;
}
