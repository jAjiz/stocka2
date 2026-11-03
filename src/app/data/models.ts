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

export interface OperationInput {
  kind: OperationKind;
  locationId: string;
  originId?: string;
  reference?: string;
  notes?: string;
  lines: OperationLineInput[];
  /** Id generado por el cliente una vez por operación: hace idempotentes los reintentos. */
  operationId?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Profile['role'];
  active: boolean;
  locationIds: string[];
  /** false: aún no ha creado su contraseña (invitación pendiente). */
  hasPassword: boolean;
}

export interface UserInput {
  displayName: string;
  role: Profile['role'];
  locationIds: string[];
}

export interface InviteInput extends UserInput {
  email: string;
}

/** Enlace de acceso (invitación o recuperación) que el administrador comparte a mano. */
export interface AccessLink {
  url: string;
  expiresAt: Date;
}
