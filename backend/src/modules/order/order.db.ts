import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../config/env';
import { createDb } from '../../platform/database/db';
import type { OrderDatabase, OrderDb } from './order.types';

/** Module Đơn hàng có database riêng (MES_Order); kết nối thuộc về module, nền tảng không biết tới. */
export const ORDER_DB = 'ORDER_DB';
export const orderDbProvider = { provide: ORDER_DB, useFactory: () => createDb<OrderDatabase>(env.db.orderName) };

@Injectable()
export class OrderDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(ORDER_DB) private readonly db: OrderDb) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
