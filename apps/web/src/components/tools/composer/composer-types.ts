import type {
  PreconditionKind,
  PreconditionFields,
} from './preconditions-panel';

export interface ComposedOperation {
  id: string;
  type: string;
  fields: Record<string, unknown>;
}

export type { PreconditionKind, PreconditionFields };

export interface PreconditionDraft {
  kind: PreconditionKind;
  fields: PreconditionFields;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  composerState: {
    sourceAccount: string;
    memo: string;
    operations: ComposedOperation[];
    preconditions?: PreconditionDraft | null;
  };
  createdAt: string;
  updatedAt: string;
}
