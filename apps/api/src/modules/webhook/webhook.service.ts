import { Injectable } from '@nestjs/common';

@Injectable()
export class WebhookService {
  create(data: { url: string; events: string[] }) {
    // TODO: persist subscription, register BullMQ job for retry delivery
    return { message: 'Webhook registration — implementation pending', data };
  }

  findAll() {
    return { message: 'Webhook listing — implementation pending', items: [] };
  }

  remove(id: string) {
    return { message: `Webhook ${id} deletion — implementation pending` };
  }
}
