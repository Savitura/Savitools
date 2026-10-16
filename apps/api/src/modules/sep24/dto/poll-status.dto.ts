import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PollStatusDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  jwt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sep10Jwt?: string;
}
