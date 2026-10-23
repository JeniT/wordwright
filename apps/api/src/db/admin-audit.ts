import type { DatabaseSync } from 'node:sqlite'
import type { AdminDecision } from '@wordwright/core'
import { nowIso } from './database'

export interface AuditEntry {
  adminId: string | null
  action: AdminDecision
  userId: string | null
  createdAt: string
}

/** Who decided what about whom (#328). Ids only; no names or addresses are copied here. */
export class AdminAuditStore {
  constructor(private readonly db: DatabaseSync) {}

  record(adminId: string, action: AdminDecision, userId: string) {
    this.db
      .prepare(
        'INSERT INTO admin_audit (admin_id, action, user_id, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(adminId, action, userId, nowIso())
  }

  list(): AuditEntry[] {
    return (
      this.db
        .prepare('SELECT admin_id, action, user_id, created_at FROM admin_audit ORDER BY id')
        .all() as Record<string, unknown>[]
    ).map((r) => ({
      adminId: (r.admin_id as string | null) ?? null,
      action: r.action as AdminDecision,
      userId: (r.user_id as string | null) ?? null,
      createdAt: r.created_at as string,
    }))
  }
}
