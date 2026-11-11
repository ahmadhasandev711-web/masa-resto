 /**
 * Public showcase dataset.
 * Two branches, the cafe menu (local storefront images), three dining sections,
 * a BOM line on every size, suppliers, stock, and 30 days of closed shifts whose
 * orders, payments, and inventory movements agree with each other.
 *
 * Refuses to run unless DEMO_MODE=true. Prefer `npm run db:demo-reset`, which
 * truncates first.
  */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/infrastructure/db/prisma';
import { SYSTEM_PERMISSIONS } from '../src/domain/staff/enums/permission.enum';
import { SYSTEM_ROLES } from '../src/domain/staff/enums/role.enum';
import {
  DEMO_ACCOUNTS,
  assertDemoResetAllowed,
  demoRolePermissions,
} from '../src/infrastructure/demo/demo-policy';
import { Money } from '../src/domain/shared/value-objects/money';
import { OrderPricingService } from '../src/domain/ordering/services/order-pricing.service';
import { CashShiftCalculatorService } from '../src/domain/finance/services/cash-shift-calculator.service';

const CURRENCY = 'EGP';
const TAX_PERCENT = 14;
const SERVICE_PERCENT = 10;
const DELIVERY_FEE_MINOR = 1500;
const OPENING_CASH_MINOR = 20000;
const PURCHASE_QTY = 2000;
const HISTORY_DAYS = 30;
const ORDERS_PER_BRANCH_PER_DAY = 4;
const ORDER_HOURS_UTC = [8, 11, 14, 17];

interface MenuSize {
  nameAr: string;
  nameEn: string;
  price: number;
}

interface MenuItem {
  nameAr: string;
  nameEn: string;
  description: string;
  imageUrl: string;
  isFeatured: boolean;
  sizes: MenuSize[];
  ingredient: { sku: string; nameAr: string; nameEn: string; unit: string; costMinor: number };
}

interface MenuCategory {
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  items: MenuItem[];
}

const MENU: MenuCategory[] = [
  {
    nameAr: 'القهوة الساخنة',
    nameEn: 'Hot Coffee',
    sortOrder: 1,
    items: [
      item('قهوة تركي', 'Turkish Coffee', 'بن محوج محضر طازج.', '/storefront/images/cafe/oriental-coffee.jpg', true, [{ nameAr: 'سنجل', nameEn: 'Single', price: 3500 }, { nameAr: 'دبل', nameEn: 'Double', price: 4500 }], 'COFFEE-BEANS', 'بن القهوة', 'Coffee beans', 'GRAM', 50),
      item('قهوة فرنساوي', 'French Coffee', 'قهوة بالحليب الساخن.', '/storefront/images/cafe/specialty-coffee.jpg', false, [{ nameAr: 'وسط', nameEn: 'Regular', price: 4500 }, { nameAr: 'كبير', nameEn: 'Large', price: 5500 }], 'MILK', 'حليب', 'Milk', 'ML', 20),
      item('قهوة عربي', 'Arabic Coffee', 'هيل وزعفران.', '/storefront/images/cafe/oriental-coffee.jpg', false, [{ nameAr: 'دلة', nameEn: 'Pot', price: 6000 }], 'CARDAMOM', 'هيل', 'Cardamom', 'GRAM', 80),
    ],
  },
  {
    nameAr: 'الإسبريسو',
    nameEn: 'Espresso',
    sortOrder: 2,
    items: [
      item('سبانش لاتيه', 'Spanish Latte', 'إسبريسو مع حليب مكثف.', '/storefront/images/cafe/specialty-coffee.jpg', true, [{ nameAr: 'وسط', nameEn: 'Regular', price: 6500 }, { nameAr: 'كبير', nameEn: 'Large', price: 8000 }], 'CONDENSED', 'حليب مكثف', 'Condensed milk', 'ML', 40),
      item('كابتشينو', 'Cappuccino', 'إسبريسو ورغوة حليب.', '/storefront/images/cafe/cozy-corner.jpg', true, [{ nameAr: 'وسط', nameEn: 'Regular', price: 5500 }, { nameAr: 'كبير', nameEn: 'Large', price: 7000 }], 'ESPRESSO', 'قهوة إسبريسو', 'Espresso coffee', 'GRAM', 60),
      item('فلات وايت', 'Flat White', 'دبل شوت مع ميكروفوم.', '/storefront/images/cafe/specialty-coffee.jpg', false, [{ nameAr: 'كوب', nameEn: 'Cup', price: 6000 }], 'ESPRESSO-FW', 'بن فلات وايت', 'Flat white beans', 'GRAM', 60),
      item('أمريكانو', 'Americano', 'إسبريسو مخفف.', '/storefront/images/cafe/cozy-corner.jpg', false, [{ nameAr: 'وسط', nameEn: 'Regular', price: 4500 }, { nameAr: 'كبير', nameEn: 'Large', price: 5500 }], 'ESPRESSO-AM', 'بن أمريكانو', 'Americano beans', 'GRAM', 55),
    ],
  },
  {
    nameAr: 'المشروبات الباردة',
    nameEn: 'Cold Drinks',
    sortOrder: 3,
    items: [
      item('آيس لاتيه', 'Iced Latte', 'لاتيه مثلج.', '/storefront/images/cafe/iced-drinks.jpg', true, [{ nameAr: 'وسط', nameEn: 'Regular', price: 7500 }, { nameAr: 'كبير', nameEn: 'Large', price: 9000 }], 'ICE', 'ثلج', 'Ice', 'GRAM', 5),
      item('آيس كراميل', 'Iced Caramel', 'كراميل مثلج.', '/storefront/images/cafe/iced-drinks.jpg', true, [{ nameAr: 'وسط', nameEn: 'Regular', price: 7000 }, { nameAr: 'كبير', nameEn: 'Large', price: 8500 }], 'CARAMEL', 'صوص كراميل', 'Caramel sauce', 'ML', 30),
      item('موكا مثلج', 'Iced Mocha', 'شوكولاتة وقهوة.', '/storefront/images/cafe/iced-drinks.jpg', false, [{ nameAr: 'كبير', nameEn: 'Large', price: 8500 }], 'COCOA', 'كاكاو', 'Cocoa', 'GRAM', 25),
      item('ليمون نعناع', 'Lemon Mint', 'عصير طازج.', '/storefront/images/cafe/iced-drinks.jpg', false, [{ nameAr: 'كبير', nameEn: 'Large', price: 5000 }], 'MINT', 'نعناع', 'Mint', 'GRAM', 15),
    ],
  },
  {
    nameAr: 'الحلويات',
    nameEn: 'Desserts',
    sortOrder: 4,
    items: [
      item('مولتن كيك', 'Molten Cake', 'كيك شوكولاتة دافئ.', '/storefront/images/cafe/bakery-sweets.jpg', true, [{ nameAr: 'قطعة', nameEn: 'Piece', price: 8500 }], 'CHOCO', 'شوكولاتة', 'Chocolate', 'GRAM', 40),
      item('تشيز كيك', 'Cheesecake', 'تشيز كيك توت.', '/storefront/images/cafe/bakery-sweets.jpg', true, [{ nameAr: 'شريحة', nameEn: 'Slice', price: 8000 }], 'CREAM-CHEESE', 'جبنة كريمية', 'Cream cheese', 'GRAM', 45),
      item('كرواسون', 'Croissant', 'زبدة فرنسي.', '/storefront/images/cafe/bakery-sweets.jpg', false, [{ nameAr: 'قطعة', nameEn: 'Piece', price: 4500 }], 'BUTTER', 'زبدة', 'Butter', 'GRAM', 35),
    ],
  },
];

function item(
  nameAr: string,
  nameEn: string,
  description: string,
  imageUrl: string,
  isFeatured: boolean,
  sizes: MenuSize[],
  sku: string,
  ingredientAr: string,
  ingredientEn: string,
  unit: string,
  costMinor: number
): MenuItem {
  return {
    nameAr,
    nameEn,
    description,
    imageUrl,
    isFeatured,
    sizes,
    ingredient: { sku, nameAr: ingredientAr, nameEn: ingredientEn, unit, costMinor },
  };
}

function daysAgoUtc(daysAgo: number, hourUtc: number, minute = 10): Date {
  const date = new Date();
  date.setUTCHours(hourUtc, minute, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

async function createInChunks<T>(
  write: (batch: T[]) => Promise<unknown>,
  rows: T[],
  size = 200
): Promise<void> {
  for (let index = 0; index < rows.length; index += size) {
    await write(rows.slice(index, index + size));
  }
}

export async function seedDemo(): Promise<void> {
  assertDemoResetAllowed();
  console.log('[seed-demo] loading showcase dataset');

  for (const perm of SYSTEM_PERMISSIONS) {
    await prisma.permission.create({
      data: {
        code: perm.code,
        name: perm.name,
        category: perm.category,
        description: perm.description,
      },
    });
  }

  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.create({
      data: { name: roleDef.name, description: roleDef.description, isSystem: true },
    });
    const permissions = await prisma.permission.findMany({
      where: { code: { in: roleDef.defaultPermissions } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });
  }

  const roleIds = new Map<string, string>();
  for (const account of DEMO_ACCOUNTS) {
    const role = await prisma.role.create({
      data: {
        name: account.roleName,
        description: `حساب تجريبي — ${account.labelAr}`,
        isSystem: true,
      },
    });
    roleIds.set(account.roleName, role.id);
    const permissions = await prisma.permission.findMany({
      where: { code: { in: demoRolePermissions(account) } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });
  }

  const nameAr = process.env.RESTAURANT_NAME_AR || 'مطعم التجربة';
  const nameEn = process.env.RESTAURANT_NAME_EN || 'Showcase Restaurant';

  await prisma.restaurantSetting.create({
    data: {
      nameAr,
      nameEn,
      currency: process.env.RESTAURANT_CURRENCY || CURRENCY,
      currencySymbol: process.env.RESTAURANT_CURRENCY_SYMBOL || 'ج.م',
      locale: 'ar-EG',
      taxRatePercent: TAX_PERCENT,
      pricesIncludeTax: false,
      serviceChargePercent: SERVICE_PERCENT,
      maxCashierDiscountPercent: 20,
      deliveryFee: DELIVERY_FEE_MINOR,
      catalogVersion: 1,
      phone: process.env.RESTAURANT_PHONE || '01000000000',
      address: process.env.RESTAURANT_ADDRESS || 'عنوان التجربة',
    },
  });

  const mainBranch = await prisma.branch.create({
    data: {
      code: 'MAIN-01',
      nameAr: 'الفرع الرئيسي',
      nameEn: 'Main Branch',
      phone: '01000000001',
      address: 'العنوان الرئيسي',
      isActive: true,
    },
  });
  const secondBranch = await prisma.branch.create({
    data: {
      code: 'TAG-02',
      nameAr: 'الفرع الثاني',
      nameEn: 'Second Branch',
      phone: '01000000002',
      address: 'العنوان الثاني',
      isActive: true,
    },
  });
  const branches = [mainBranch, secondBranch];

  const passwordHashes = await Promise.all(
    DEMO_ACCOUNTS.map((account) => bcrypt.hash(account.password, 10))
  );
  const users = [];
  for (let index = 0; index < DEMO_ACCOUNTS.length; index += 1) {
    const account = DEMO_ACCOUNTS[index];
    const user = await prisma.user.create({
      data: {
        username: account.username,
        fullName: account.fullName,
        phone: `0102000000${index + 1}`,
        passwordHash: passwordHashes[index],
        isActive: true,
        roleId: roleIds.get(account.roleName)!,
      },
    });
    users.push(user);
  }

  const cashier = users.find((user) => user.username === 'demo_cashier')!;
  await prisma.userBranch.createMany({
    data: users.flatMap((user) =>
      branches.map((branch, branchIndex) => ({
        userId: user.id,
        branchId: branch.id,
        isDefault: branchIndex === 0,
      }))
    ),
  });

  const sections = [
    { nameAr: 'الصالة الداخلية', nameEn: 'Indoor Hall', sortOrder: 1 },
    { nameAr: 'التراس', nameEn: 'Terrace', sortOrder: 2 },
    { nameAr: 'العائلات', nameEn: 'Family', sortOrder: 3 },
  ];
  for (const sectionDef of sections) {
    const section = await prisma.tableSection.create({
      data: { branchId: mainBranch.id, ...sectionDef, isActive: true },
    });
    await prisma.diningTable.createMany({
      data: [1, 2].map((tableNo) => ({
        branchId: mainBranch.id,
        sectionId: section.id,
        tableNumber: `${sectionDef.sortOrder}${tableNo}`,
        capacity: 4,
        status: 'AVAILABLE',
        shape: 'SQUARE',
        sortOrder: tableNo,
        isActive: true,
      })),
    });
  }

  interface SellableSize {
    id: string;
    productId: string;
    nameAr: string;
    nameEn: string;
    productNameAr: string;
    productNameEn: string;
    price: number;
    inventoryItemId: string;
  }

  const sellable: SellableSize[] = [];
  for (const categoryDef of MENU) {
    const category = await prisma.category.create({
      data: {
        nameAr: categoryDef.nameAr,
        nameEn: categoryDef.nameEn,
        sortOrder: categoryDef.sortOrder,
        isActive: true,
      },
    });
    for (let itemIndex = 0; itemIndex < categoryDef.items.length; itemIndex += 1) {
      const menuItem = categoryDef.items[itemIndex];
      const product = await prisma.product.create({
        data: {
          categoryId: category.id,
          nameAr: menuItem.nameAr,
          nameEn: menuItem.nameEn,
          description: menuItem.description,
          imageUrl: menuItem.imageUrl,
          isFeatured: menuItem.isFeatured,
          sortOrder: itemIndex + 1,
          isActive: true,
        },
      });
      const inventoryItem = await prisma.inventoryItem.create({
        data: {
          sku: menuItem.ingredient.sku,
          nameAr: menuItem.ingredient.nameAr,
          nameEn: menuItem.ingredient.nameEn,
          unit: menuItem.ingredient.unit,
          defaultCostMinor: menuItem.ingredient.costMinor,
          isActive: true,
        },
      });
      for (let sizeIndex = 0; sizeIndex < menuItem.sizes.length; sizeIndex += 1) {
        const sizeDef = menuItem.sizes[sizeIndex];
        const size = await prisma.productSize.create({
          data: {
            productId: product.id,
            nameAr: sizeDef.nameAr,
            nameEn: sizeDef.nameEn,
            price: sizeDef.price,
            sortOrder: sizeIndex + 1,
            isActive: true,
          },
        });
        await prisma.recipeItem.create({
          data: {
            inventoryItemId: inventoryItem.id,
            productSizeId: size.id,
            quantity: '1.000',
          },
        });
        sellable.push({
          id: size.id,
          productId: product.id,
          nameAr: size.nameAr,
          nameEn: size.nameEn,
          productNameAr: product.nameAr,
          productNameEn: product.nameEn,
          price: size.price,
          inventoryItemId: inventoryItem.id,
        });
      }
    }
  }

  const ingredientIds = [...new Set(sellable.map((size) => size.inventoryItemId))];
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: { name: 'مورد البن', contactName: 'قسم المشتريات', phone: '01030000001', isActive: true },
    }),
    prisma.supplier.create({
      data: { name: 'مورد المخبوزات', contactName: 'قسم المشتريات', phone: '01030000002', isActive: true },
    }),
  ]);

  const stock = new Map<string, number>();
  const purchaseMovements: Array<{
    id: string;
    branchId: string;
    inventoryItemId: string;
    type: string;
    quantityDelta: string;
    quantityBefore: string;
    quantityAfter: string;
    unitCostMinor: number;
    referenceId: string;
    notes: string;
    createdById: string;
    createdAt: Date;
  }> = [];
  const receivedAt = daysAgoUtc(HISTORY_DAYS + 1, 6);

  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const branch = branches[branchIndex];
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        orderNumber: `PO-${1001 + branchIndex}`,
        supplierId: suppliers[branchIndex].id,
        branchId: branch.id,
        status: 'RECEIVED',
        totalMinor: 0,
        notes: 'رصيد افتتاحي للتجربة',
        receivedAt,
        createdById: cashier.id,
        createdAt: receivedAt,
      },
    });
    let totalMinor = 0;
    const poItems = [];
    for (const inventoryItemId of ingredientIds) {
      const cost = sellable.find((size) => size.inventoryItemId === inventoryItemId)!.price > 0
        ? (await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } }))!.defaultCostMinor
        : 0;
      const lineTotal = cost * PURCHASE_QTY;
      totalMinor += lineTotal;
      poItems.push({
        purchaseOrderId: purchaseOrder.id,
        inventoryItemId,
        quantity: String(PURCHASE_QTY),
        unitCostMinor: cost,
        totalCostMinor: lineTotal,
      });
      stock.set(`${branch.id}|${inventoryItemId}`, PURCHASE_QTY);
      purchaseMovements.push({
        id: crypto.randomUUID(),
        branchId: branch.id,
        inventoryItemId,
        type: 'PURCHASE',
        quantityDelta: String(PURCHASE_QTY),
        quantityBefore: '0.000',
        quantityAfter: String(PURCHASE_QTY),
        unitCostMinor: cost,
        referenceId: purchaseOrder.id,
        notes: 'استلام رصيد افتتاحي',
        createdById: cashier.id,
        createdAt: receivedAt,
      });
    }
    await prisma.purchaseOrderItem.createMany({ data: poItems });
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: { totalMinor },
    });
  }

  const customers = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      prisma.customer.create({
        data: {
          phone: `0104000000${n}`,
          fullName: `عميل تجربة ${n}`,
          isActive: true,
        },
      })
    )
  );

  interface ShiftBucket {
    id: string;
    branchId: string;
    openedAt: Date;
    closedAt: Date;
    salesMinor: number;
  }

  const shifts: ShiftBucket[] = [];
  const orders: Array<Record<string, unknown>> = [];
  const orderItems: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const saleMovements: typeof purchaseMovements = [];

  let sequence = 1000;
  const orderTypes = ['TAKEAWAY', 'DINE_IN', 'DELIVERY'] as const;

  for (let day = HISTORY_DAYS; day >= 1; day -= 1) {
    for (const branch of branches) {
      const openedAt = daysAgoUtc(day, 6, 0);
      const closedAt = daysAgoUtc(day, 20, 0);
      const shift: ShiftBucket = {
        id: crypto.randomUUID(),
        branchId: branch.id,
        openedAt,
        closedAt,
        salesMinor: 0,
      };
      shifts.push(shift);

      for (let slot = 0; slot < ORDERS_PER_BRANCH_PER_DAY; slot += 1) {
        sequence += 1;
        const size = sellable[(sequence + slot) % sellable.length];
        const quantity = slot % 2 === 0 ? 1 : 2;
        const type = orderTypes[(sequence + slot) % orderTypes.length];
        const priced = OrderPricingService.calculateDetailed({
          items: [{ unitPrice: Money.fromMinor(size.price, CURRENCY), quantity }],
          taxRatePercent: TAX_PERCENT,
          serviceChargePercent: SERVICE_PERCENT,
          pricesIncludeTax: false,
          isDineIn: type === 'DINE_IN',
          deliveryFee: type === 'DELIVERY' ? Money.fromMinor(DELIVERY_FEE_MINOR, CURRENCY) : Money.zero(CURRENCY),
          discount: Money.zero(CURRENCY),
        });
        const createdAt = daysAgoUtc(day, ORDER_HOURS_UTC[slot], 10 + slot);
        const orderId = crypto.randomUUID();
        const customer = type === 'DELIVERY' ? customers[sequence % customers.length] : null;
        shift.salesMinor += priced.total.amount;

        orders.push({
          id: orderId,
          orderNumber: String(sequence),
          trackingToken: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
          customerId: customer?.id ?? null,
          branchId: branch.id,
          cashierId: cashier.id,
          cashShiftId: shift.id,
          currency: CURRENCY,
          source: 'POS',
          type,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          subtotalMinor: priced.subtotal.amount,
          deliveryFeeMinor: priced.deliveryFee.amount,
          taxRatePercent: TAX_PERCENT,
          taxMinor: priced.tax.amount,
          serviceMinor: priced.service.amount,
          discountMinor: 0,
          totalMinor: priced.total.amount,
          customerName: customer?.fullName ?? null,
          customerPhone: customer?.phone ?? null,
          isTabOpen: false,
          createdById: cashier.id,
          createdAt,
        });
        orderItems.push({
          id: crypto.randomUUID(),
          orderId,
          productId: size.productId,
          sizeId: size.id,
          productNameAr: size.productNameAr,
          productNameEn: size.productNameEn,
          sizeNameAr: size.nameAr,
          sizeNameEn: size.nameEn,
          unitPriceMinor: size.price,
          quantity,
          totalPriceMinor: size.price * quantity,
          isPrepared: true,
          preparedAt: createdAt,
        });
        payments.push({
          id: crypto.randomUUID(),
          orderId,
          method: 'CASH',
          amountMinor: priced.total.amount,
          createdAt,
        });

        const stockKey = `${branch.id}|${size.inventoryItemId}`;
        const before = stock.get(stockKey) ?? 0;
        const after = before - quantity;
        stock.set(stockKey, after);
        saleMovements.push({
          id: crypto.randomUUID(),
          branchId: branch.id,
          inventoryItemId: size.inventoryItemId,
          type: 'SALE_POS',
          quantityDelta: String(-quantity),
          quantityBefore: before.toFixed(3),
          quantityAfter: after.toFixed(3),
          unitCostMinor: 0,
          referenceId: orderId,
          notes: `خصم وصفة الطلب ${sequence}`,
          createdById: cashier.id,
          createdAt,
        });
      }
    }
  }

  await prisma.cashShift.createMany({
    data: shifts.map((shift) => {
      const expected = CashShiftCalculatorService.calculateExpectedCash({
        openingCash: Money.fromMinor(OPENING_CASH_MINOR, CURRENCY),
        cashSales: Money.fromMinor(shift.salesMinor, CURRENCY),
        cashInTotal: Money.zero(CURRENCY),
        cashDropTotal: Money.zero(CURRENCY),
        registerExpensesTotal: Money.zero(CURRENCY),
        cashRefundsTotal: Money.zero(CURRENCY),
      });
      return {
        id: shift.id,
        branchId: shift.branchId,
        cashierId: cashier.id,
        currency: CURRENCY,
        status: 'CLOSED',
        openingCashMinor: OPENING_CASH_MINOR,
        closingCashMinor: expected.amount,
        expectedCashMinor: expected.amount,
        varianceMinor: 0,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
      };
    }),
  });

  await createInChunks((batch) => prisma.order.createMany({ data: batch as never }), orders);
  await createInChunks((batch) => prisma.orderItem.createMany({ data: batch as never }), orderItems);
  await createInChunks((batch) => prisma.orderPayment.createMany({ data: batch as never }), payments);
  await createInChunks(
    (batch) => prisma.inventoryMovement.createMany({ data: batch as never }),
    [...purchaseMovements, ...saleMovements]
  );

  await prisma.branchInventory.createMany({
    data: [...stock.entries()].map(([key, quantity]) => {
      const [branchId, inventoryItemId] = key.split('|');
      return {
        branchId,
        inventoryItemId,
        quantity: quantity.toFixed(3),
        minThreshold: '20.000',
      };
    }),
  });

  await prisma.cashShift.create({
    data: {
      branchId: mainBranch.id,
      cashierId: cashier.id,
      currency: CURRENCY,
      status: 'OPEN',
      openingCashMinor: OPENING_CASH_MINOR,
      openedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  if (payments.length !== orders.length || saleMovements.length !== orders.length) {
    throw new Error('Showcase history is inconsistent: every order needs one payment and one stock movement');
  }

  await prisma.documentSequence.createMany({
    data: [
      { key: 'ORDER', value: sequence },
      { key: 'PO', value: 1000 + branches.length },
    ],
  });

  console.log(`[seed-demo] ${branches.length} branches, ${sellable.length} sizes, ${orders.length} historical orders, sequence ${sequence}`);
  for (const account of DEMO_ACCOUNTS) {
    console.log(`[seed-demo] ${account.labelAr}: ${account.username} / ${account.password}`);
  }
}

const invokedDirectly = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('prisma/seed-demo.ts');
if (invokedDirectly) {
  seedDemo()
    .catch((error) => {
      console.error('[seed-demo] failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
