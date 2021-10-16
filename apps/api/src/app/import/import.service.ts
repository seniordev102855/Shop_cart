import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { isSameDay, parseISO } from 'date-fns';

@Injectable()
export class ImportService {
  private static MAX_ORDERS_TO_IMPORT = 20;

  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly orderService: OrderService
  ) {}

  public async import({
    orders,
    userId
  }: {
    orders: Partial<Order>[];
    userId: string;
  }): Promise<void> {
    await this.validateOrders({ orders, userId });

    for (const {
      accountId,
      currency,
      dataSource,
      date,
      fee,
      quantity,
      symbol,
      type,
      unitPrice
    } of orders) {
      await this.orderService.createOrder({
        Account: {
          connect: {
            id_userId: { userId, id: accountId }
          }
        },
        currency,
        dataSource,
        fee,
        quantity,
        symbol,
        type,
        unitPrice,
        date: parseISO(<string>(<unknown>date)),
        User: { connect: { id: userId } }
      });
    }
  }

  private async validateOrders({
    orders,
    userId
  }: {
    orders: Partial<Order>[];
    userId: string;
  }) {
    if (orders?.length > ImportService.MAX_ORDERS_TO_IMPORT) {
      throw new Error('Too many transactions');
    }

    const existingOrders = await this.orderService.orders({
      orderBy: { date: 'desc' },
      where: { userId }
    });

    for (const [
      index,
      { currency, dataSource, date, fee, quantity, symbol, type, unitPrice }
    ] of orders.entries()) {
      const duplicateOrder = existingOrders.find((order) => {
        return (
          order.currency === currency &&
          order.dataSource === dataSource &&
          isSameDay(order.date, parseISO(<string>(<unknown>date))) &&
          order.fee === fee &&
          order.quantity === quantity &&
          order.symbol === symbol &&
          order.type === type &&
          order.unitPrice === unitPrice
        );
      });

      if (duplicateOrder) {
        throw new Error(`orders.${index} is a duplicate transaction`);
      }

      const result = await this.dataProviderService.get([
        { dataSource, symbol }
      ]);

      if (result[symbol] === undefined) {
        throw new Error(
          `orders.${index}.symbol ("${symbol}") is not valid for the specified data source ("${dataSource}")`
        );
      }
    }
  }
}
