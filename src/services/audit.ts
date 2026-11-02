// Audit service. Demo: entries live in local app state (persisted to this browser).
// Production: an append-only Supabase/PostgreSQL table written by the server.

import type { AuditEntry } from '../domain/types';
import { uid } from '../domain/util';

export interface AuditService {
  readonly name: string;
  entry(e: Omit<AuditEntry, 'id' | 'at' | 'mode'>): AuditEntry;
}

export const localAudit: AuditService = {
  name: 'Local audit log (demo)',
  entry: (e) => ({ ...e, id: uid('aud'), at: new Date().toISOString(), mode: 'demo' }),
};
