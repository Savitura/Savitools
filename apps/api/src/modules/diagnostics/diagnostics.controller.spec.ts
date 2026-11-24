import { Test } from '@nestjs/testing';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('DiagnosticsController (Savitura/Savitools#506)', () => {
  const bundle = {
    generatedAt: '2026-11-24T00:00:00.000Z',
    serviceName: 'savitools-api',
  };

  it('returns the service bundle', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DiagnosticsController],
      providers: [
        { provide: DiagnosticsService, useValue: { build: () => bundle } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = moduleRef.get(DiagnosticsController);
    expect(controller.getBundle()).toBe(bundle);
  });

  it('is guarded by JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', DiagnosticsController);
    expect(guards).toEqual([JwtAuthGuard]);
  });
});
