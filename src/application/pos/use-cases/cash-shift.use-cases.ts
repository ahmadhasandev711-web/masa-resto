import { PosRepository } from '../../../domain/pos/contracts/pos.repository';
import { CloseCashShiftDto, closeCashShiftSchema, OpenCashShiftDto, openCashShiftSchema } from '../dto/pos.dto';

export class OpenCashShiftUseCase {
  constructor(private readonly repository: PosRepository) {}
  public async execute(input: OpenCashShiftDto, cashierId: string) {
    const value = openCashShiftSchema.parse(input);
    return this.repository.openShift(value.branchId, cashierId, value.openingCashMinor);
  }
}
export class GetActiveCashShiftUseCase {
  constructor(private readonly repository: PosRepository) {}
  public execute(cashierId: string) { return this.repository.getActiveShift(cashierId); }
}
export class CloseCashShiftUseCase {
  constructor(private readonly repository: PosRepository) {}
  public async execute(input: CloseCashShiftDto, cashierId: string) {
    const value = closeCashShiftSchema.parse(input);
    return this.repository.closeShift(value.branchId, cashierId, value.cashShiftId, value.closingCashMinor, value.clientPendingCount);
  }
}
