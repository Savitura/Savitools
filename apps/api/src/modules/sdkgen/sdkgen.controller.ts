import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { GenerateSdkDto } from './dto/generate-sdk.dto';
import { SdkgenService } from './sdkgen.service';

@Controller('sdkgen')
export class SdkgenController {
  constructor(private readonly sdkgenService: SdkgenService) {}

  @Post('generate')
  generate(@Body(new ValidationPipe()) dto: GenerateSdkDto) {
    const code = this.sdkgenService.generate(dto);
    return { code };
  }
}
