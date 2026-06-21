import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePassword123', minLength: 8, description: 'Password must be at least 8 characters' })
  @IsString()
  @MinLength(8)
  password!: string;
}
