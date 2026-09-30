import { IsOptional, IsString, IsUuid, MaxLength } from 'class-validator';

export class PollStatusDto {
  @IsUuid()
  sessionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  jwt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sep10Jwt?: string;
}
