import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { GenerateSdkDto } from './dto/generate-sdk.dto';
import { SdkgenService } from './sdkgen.service';

@ApiTags('sdkgen')
@Controller('sdkgen')
export class SdkgenController {
  constructor(private readonly sdkgenService: SdkgenService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate SDK code' })
  @ApiResponse({ status: 200, description: 'SDK code generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid SDK generation parameters' })
  generate(@Body(new ValidationPipe()) dto: GenerateSdkDto) {
    const code = this.sdkgenService.generate(dto);
    return { code };
  }
}
