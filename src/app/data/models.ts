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

/** Aviso de stock activo: la cantidad ha llegado al umbral de una regla. */
export interface StockAlert {
  itemId: string;
  locationId: string;
  quantity: number;
  level: 'warning' | 'critical';
  threshold: number;
}

export interface AlertRule {
  id: string;
  name: string;
  allItems: boolean;
  allLocations: boolean;
  itemIds: string[];
  locationIds: string[];
  warning: number | null;
  critical: number | null;
  active: boolean;
}

/** `null` en itemIds / locationIds = todos (incluidos los que se den de alta después). */
export interface AlertRuleInput {
  name: string;
  itemIds: string[] | null;
  locationIds: string[] | null;
  warning: number | null;
  critical: number | null;
}
