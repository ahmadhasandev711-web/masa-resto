import fs from 'fs';
import path from 'path';

const files = [
  'tests/application/branch-performance-use-case.test.ts',
  'tests/application/branch-use-cases.test.ts',
  'tests/application/catalog-lifecycle-use-cases.test.ts',
  'tests/application/customer-use-cases.test.ts',
  'tests/application/delivery-use-cases.test.ts',
  'tests/application/event-booking-use-cases.test.ts',
  'tests/application/finance-branch-scoping.test.ts',
  'tests/application/finance-use-cases.test.ts',
  'tests/application/inventory-analytics-use-case.test.ts',
  'tests/application/inventory-branch-auth.test.ts',
  'tests/application/inventory-use-cases.test.ts',
  'tests/application/invoices-audit-use-cases.test.ts',
  'tests/application/kitchen-use-cases.test.ts',
  'tests/application/menu-engineering-use-case.test.ts',
  'tests/application/order-operations-use-cases.test.ts',
  'tests/application/order-use-cases.test.ts',
  'tests/application/pos-use-cases.test.ts',
  'tests/application/sales-analytics-use-case.test.ts',
  'tests/application/staff-management-use-cases.test.ts',
  'tests/application/table-management-use-cases.test.ts',
  'tests/application/web-order-security-idempotency.test.ts',
  'tests/infrastructure/atomic-inventory-cogs.test.ts',
  'tests/infrastructure/pos-inventory-deduction.test.ts',
];

for (const rel of files) {
  const full = path.join(process.cwd(), rel);
  if (!fs.existsSync(full)) {
    console.warn('Missing:', rel);
    continue;
  }
  let content = fs.readFileSync(full, 'utf8');
  if (content.includes('isDbAvailable')) {
    console.log('Already patched:', rel);
    continue;
  }

  // add import
  content = `import { isDbAvailable } from '../test-db-helper';\n` + content;
  // replace the first describe( with describe.skipIf(!isDbAvailable)(
  content = content.replace(/describe\(/, 'describe.skipIf(!isDbAvailable)(');
  fs.writeFileSync(full, content, 'utf8');
  console.log('Patched:', rel);
}
