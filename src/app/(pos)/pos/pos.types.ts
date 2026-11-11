import { PosCategory, PosReceipt, PosSettings, PosShift } from '../../../domain/pos/contracts/pos.repository';
import { TableItemView } from '../../../application/tables/use-cases/list-tables.use-case';

export interface PosSection {
  id: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}

export interface PosClientProps {
  branch: { id: string; nameAr: string; code?: string };
  settings: PosSettings;
  categories: PosCategory[];
  initialShift: PosShift | null;
  initialReceipts: PosReceipt[];
  canDiscount: boolean;
  initialTables: TableItemView[];
  initialSections: PosSection[];
  cashierId?: string;
}
