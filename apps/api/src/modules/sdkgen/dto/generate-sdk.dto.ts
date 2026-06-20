import { IsIn, IsOptional, IsString } from 'class-validator';

export class GenerateSdkDto {
  @IsIn(['fluxa', 'crowdpay'])
  spec: 'fluxa' | 'crowdpay';

  @IsString()
  language: string;

  @IsOptional()
  @IsString()
  endpoint?: string;
}
