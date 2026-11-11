import { FinanceRepository, ExpenseListItem } from '../../../domain/finance/contracts/finance.repository';
import { CreateExpenseDto, CreateExpenseSchema } from '../dto/finance.dto';

export class CreateExpenseUseCase {
  constructor(private readonly financeRepo: FinanceRepository) {}

  public async execute(
    dto: CreateExpenseDto,
    spentById: string,
    currency: string,
    approvedById?: string
  ): Promise<ExpenseListItem> {
    const validated = CreateExpenseSchema.parse(dto);

    return this.financeRepo.createExpense({
      branchId: validated.branchId,
      categoryId: validated.categoryId,
      amountMinor: validated.amountMinor,
      currency,
      source: validated.source,
      description: validated.description,
      receiptNumber: validated.receiptNumber || undefined,
      spentById,
      cashShiftId: validated.cashShiftId || undefined,
      approvedById,
    });
  }
}
