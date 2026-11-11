import { Money } from '../../shared/value-objects/money';
import { ValidationError } from '../../shared/errors/domain-error';

export interface ShiftVarianceAnalysis {
  expectedCash: Money;
  countedCash: Money;
  variance: Money;
  varianceStatus: 'BALANCED' | 'SHORTAGE' | 'OVERAGE';
}

export class CashShiftCalculatorService {
  /**
   * Calculates the exact expected physical cash inside the register drawer (GR-1.1).
   * Formula: Opening Cash + POS Cash Sales + Cash In - Cash Drops - Drawer Expenses - Cash Refunds
   */
  public static calculateExpectedCash(params: {
    openingCash: Money;
    cashSales: Money;
    cashInTotal: Money;
    cashDropTotal: Money;
    registerExpensesTotal: Money;
    cashRefundsTotal?: Money;
  }): Money {
    const { openingCash, cashSales, cashInTotal, cashDropTotal, registerExpensesTotal, cashRefundsTotal } = params;
    const refunds = cashRefundsTotal ?? Money.zero(openingCash.currency);

    // Currency consistency check is handled inside Money operations
    return openingCash
      .add(cashSales)
      .add(cashInTotal)
      .subtract(cashDropTotal)
      .subtract(registerExpensesTotal)
      .subtract(refunds);
  }

  /**
   * Compares the counted physical cash against the expected drawer cash.
   * Variance = Counted - Expected.
   */
  public static analyzeVariance(countedCash: Money, expectedCash: Money): ShiftVarianceAnalysis {
    const variance = countedCash.subtract(expectedCash);

    let varianceStatus: 'BALANCED' | 'SHORTAGE' | 'OVERAGE' = 'BALANCED';
    if (variance.amount < 0) {
      varianceStatus = 'SHORTAGE';
    } else if (variance.amount > 0) {
      varianceStatus = 'OVERAGE';
    }

    return {
      expectedCash,
      countedCash,
      variance,
      varianceStatus,
    };
  }

  /**
   * Validates a cash movement (in or drop) before execution.
   */
  public static validateMovement(amountMinor: number, reason: string): void {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new ValidationError('مبلغ الحركة النقدية يجب أن يكون رقماً صحيحاً وموجباً');
    }
    if (!reason || reason.trim().length < 3) {
      throw new ValidationError('يجب إدخال سبب واضح ومفصل للحركة النقدية (3 أحرف على الأقل)');
    }
  }
}
