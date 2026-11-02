export type OperationKind = 'add' | 'move' | 'remove' | 'consume';

export interface Profile {
  id: string;
  displayName: string;
  role: 'admin' | 'user';
  active: boolean;
}

export interface Location {
  id: string;
  name: string;
  kind: 'warehouse' | 'vehicle';
  active: boolean;
}

export interface ItemType {
  id: string;
  name: string;
  active: boolean;
}

export interface Item {
  id: string;
  name: string;
  typeId: string;
  reference: string | null;
  active: boolean;
}

export interface StockRow {
  itemId: string;
  locationId: string;
  quantity: number;
}

export interface OperationLineInput {
  itemId: string;
  quantity: number;
}

export interface OperationSummary {
  id: string;
  kind: OperationKind;
  originId: string | null;
  destinationId: string | null;
  reference: string | null;
  notes: string | null;
  userId: string;
  createdAt: Date;
  lineCount: number;
}

export interface OperationLine {
  itemId: string;
  quantity: number;
}
