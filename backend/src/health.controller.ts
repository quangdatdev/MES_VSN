import { Controller, Get } from '@nestjs/common';
import { Public } from './platform/auth/decorators';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }
}
