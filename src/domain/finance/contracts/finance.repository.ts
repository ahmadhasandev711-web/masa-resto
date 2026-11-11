import { CashMovementType, ExpenseSource, CashShiftStatus } from '../enums';

export interface CashShiftListItem {
  id: string;
  branchId: string;
  branchNameAr: string;
  cashierId: string;
  cashierName: string;
  status: CashShiftStatus;
  currency: string;
  openingCashMinor: number;
  closingCashMinor: number | null;
  expectedCashMinor: number | null;
  varianceMinor: number | null;
  varianceReason: string | null;
  openedAt: string;
  closedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  totalOrdersCount: number;
  totalSalesMinor: number;
  cashSalesMinor: number;
  cardSalesMinor: number;
}

export interface ShiftMovementRecord {
  id: string;
  type: CashMovementType;
  amountMinor: number;
  reason: string;
  performedByName: string;
  createdAt: string;
}

export interface ShiftExpenseRecord {
  id: string;
  categoryNameAr: string;
  amountMinor: number;
  description: string;
  receiptNumber: string | null;
  spentByName: string;
  createdAt: string;
}

export interface CashShiftDetail extends CashShiftListItem {
  cashInMinor: number;
  cashDropMinor: number;
  registerExpensesMinor: number;
  movements: ShiftMovementRecord[];
  drawerExpenses: ShiftExpenseRecord[];
}

export interface ExpenseCategoryItem {
  id: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  isActive: boolean;
}

export interface ExpenseListItem {
  id: string;
  branchId: string;
  branchNameAr: string;
  categoryId: string;
  categoryNameAr: string;
  categoryNameEn: string;
  amountMinor: number;
  currency: string;
  source: ExpenseSource;
  description: string;
  receiptNumber: string | null;
  spentById: string;
  spentByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  cashShiftId: string | null;
  createdAt: string;
}

export interface DailySalesAndCogs {
  date: string;
  salesMinor: number;
  cogsMinor: number;
  expensesMinor: number;
  grossProfitMinor: number;
}

export interface ProfitAndLossReport {
  currency: string;
  currencySymbol: string;
  fromDate: string;
  toDate: string;
  totalOrdersCount: number;
  netSalesMinor: number;
  cogsMinor: number;
  operatingExpensesMinor: number;
  grossProfitMinor: number;
  operatingProfitMinor: number;
  cogsPercent: number;
  grossMarginPercent: number;
  operatingMarginPercent: number;
  expensesByCategory: {
    categoryNameAr: string;
    totalMinor: number;
    percent: number;
  }[];
  dailyBreakdown: DailySalesAndCogs[];
}

export interface FinanceRepository {
  listShifts(params: {
    branchId: string;
    status?: CashShiftStatus;
    cashierId?: string;
    limit?: number;
  }): Promise<CashShiftListItem[]>;

  getShiftDetails(shiftId: string, branchId?: string): Promise<CashShiftDetail | null>;

  getActiveShift(branchId: string, cashierId: string): Promise<CashShiftDetail | null>;

  recordMovement(params: {
    shiftId: string;
    branchId: string;
    type: CashMovementType;
    amountMinor: number;
    reason: string;
    performedById: string;
  }): Promise<ShiftMovementRecord>;

  blindCloseShift(params: {
    shiftId: string;
    branchId: string;
    cashierId: string;
    countedCashMinor: number;
    varianceReason?: string;
  }): Promise<CashShiftDetail>;

  auditShift(params: {
    shiftId: string;
    branchId: string;
    approverId: string;
    notes?: string;
  }): Promise<CashShiftDetail>;

  listExpenses(params: {
    branchId: string;
    categoryId?: string;
    source?: ExpenseSource;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<ExpenseListItem[]>;

  createExpense(params: {
    branchId: string;
    categoryId: string;
    amountMinor: number;
    currency: string;
    source: ExpenseSource;
    description: string;
    receiptNumber?: string;
    spentById: string;
    cashShiftId?: string;
    approvedById?: string;
  }): Promise<ExpenseListItem>;

  listCategories(): Promise<ExpenseCategoryItem[]>;

  getProfitAndLoss(params: {
    branchId?: string;
    fromDate: Date;
    toDate: Date;
  }): Promise<ProfitAndLossReport>;
}
