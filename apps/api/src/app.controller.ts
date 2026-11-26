import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check - API liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive and responding' })
  health() {
    return this.appService.health();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness check - checks Redis and other dependencies' })
  @ApiResponse({ 
    status: 200, 
    description: 'Service is ready to handle requests',
    schema: {
      example: {
        status: 'ready',
        service: 'savitools-api',
        timestamp: '2024-01-01T00:00:00.000Z',
        checks: {
          redis: 'connected'
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Service is not ready (Redis disconnected)',
    schema: {
      example: {
        status: 'not_ready',
        service: 'savitools-api',
        timestamp: '2024-01-01T00:00:00.000Z',
        checks: {
          redis: 'disconnected'
        }
      }
    }
  })
  readiness() {
    return this.appService.readiness();
  }
}
