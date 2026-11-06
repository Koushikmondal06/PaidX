import 'server-only';
import { query } from './neon';

interface Filter {
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'IS';
  value: any;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
}

export class NeonQueryBuilder {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectedColumns: string = '*';
  private insertPayload: any = null;
  private updatePayload: any = null;
  private upsertOptions?: { onConflict?: string };
  private filters: Filter[] = [];
  private orderSpecs: OrderSpec[] = [];
  private limitCount?: number;
  private wantSingle: boolean = false;
  private wantMaybeSingle: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*', _options?: { count?: string; head?: boolean }) {
    if (this.action !== 'insert' && this.action !== 'update' && this.action !== 'upsert') {
      this.action = 'select';
    }
    this.selectedColumns = columns;
    return this;
  }

  insert(values: Record<string, any> | Record<string, any>[]) {
    this.action = 'insert';
    this.insertPayload = values;
    return this;
  }

  update(values: Record<string, any>) {
    this.action = 'update';
    this.updatePayload = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(values: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.insertPayload = values;
    this.upsertOptions = options;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, op: '=', value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ column, op: '!=', value });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push({ column, op: '>', value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ column, op: '>=', value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ column, op: '<', value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ column, op: '<=', value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ column, op: 'IN', value: values });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push({ column, op: 'IS', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderSpecs.push({
      column,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.wantSingle = true;
    return this.execute();
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this.wantMaybeSingle = true;
    return this.execute();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhereClause(params: any[]): string {
    if (this.filters.length === 0) return '';
    const clauses: string[] = [];

    for (const f of this.filters) {
      if (f.op === 'IS') {
        if (f.value === null) {
          clauses.push(`"${f.column}" IS NULL`);
        } else {
          clauses.push(`"${f.column}" IS NOT NULL`);
        }
      } else if (f.op === 'IN') {
        const arr = Array.isArray(f.value) ? f.value : [f.value];
        if (arr.length === 0) {
          clauses.push('FALSE');
        } else {
          const inPlaceholders = arr.map((item) => {
            params.push(item);
            return `$${params.length}`;
          });
          clauses.push(`"${f.column}" IN (${inPlaceholders.join(', ')})`);
        }
      } else {
        params.push(f.value);
        clauses.push(`"${f.column}" ${f.op} $${params.length}`);
      }
    }

    return ' WHERE ' + clauses.join(' AND ');
  }

  private async execute(): Promise<{ data: any; error: any }> {
    try {
      if (this.action === 'select') {
        return await this.executeSelect();
      } else if (this.action === 'insert') {
        return await this.executeInsert();
      } else if (this.action === 'update') {
        return await this.executeUpdate();
      } else if (this.action === 'delete') {
        return await this.executeDelete();
      } else if (this.action === 'upsert') {
        return await this.executeUpsert();
      }
      return { data: null, error: new Error(`Unsupported action ${this.action}`) };
    } catch (err: any) {
      console.error(`[Neon DB Error on ${this.tableName}]`, err);
      return { data: null, error: { message: err?.message || String(err) } };
    }
  }

  private async executeSelect(): Promise<{ data: any; error: any }> {
    const params: any[] = [];
    const whereSql = this.buildWhereClause(params);

    let orderSql = '';
    if (this.orderSpecs.length > 0) {
      orderSql =
        ' ORDER BY ' +
        this.orderSpecs
          .map((o) => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`)
          .join(', ');
    }

    let limitSql = '';
    if (typeof this.limitCount === 'number') {
      limitSql = ` LIMIT ${this.limitCount}`;
    }

    // Parse whether relations were requested
    const hasWalletsRelation = this.selectedColumns.includes('wallets');
    const hasPoliciesRelation = this.selectedColumns.includes('agent_policies');
    const hasAgentConnectionsRelation = this.selectedColumns.includes('agent_connections');
    const hasMerchantsRelation = this.selectedColumns.includes('merchants');

    const sqlText = `SELECT * FROM "${this.tableName}"${whereSql}${orderSql}${limitSql}`;
    const rows = await query(sqlText, params);

    // Hydrate relations if requested
    if (rows && rows.length > 0) {
      if (this.tableName === 'agent_connections') {
        if (hasWalletsRelation) {
          const walletIds = [...new Set(rows.map((r) => r.wallet_id).filter(Boolean))];
          if (walletIds.length > 0) {
            const wallets = await query(
              `SELECT id, address, kind FROM "wallets" WHERE id = ANY($1::uuid[])`,
              [walletIds]
            );
            const walletMap = new Map(wallets.map((w) => [w.id, w]));
            for (const r of rows) {
              r.wallets = walletMap.get(r.wallet_id) || null;
            }
          } else {
            for (const r of rows) r.wallets = null;
          }
        }
        if (hasPoliciesRelation) {
          const connIds = rows.map((r) => r.id);
          const policies = await query(
            `SELECT * FROM "agent_policies" WHERE agent_id = ANY($1::uuid[])`,
            [connIds]
          );
          const policyMap = new Map(policies.map((p) => [p.agent_id, p]));
          for (const r of rows) {
            r.agent_policies = policyMap.get(r.id) || null;
          }
        }
      } else if (this.tableName === 'agent_payments') {
        if (hasAgentConnectionsRelation) {
          const connIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))];
          if (connIds.length > 0) {
            const connections = await query(
              `SELECT * FROM "agent_connections" WHERE id = ANY($1::uuid[])`,
              [connIds]
            );
            if (hasWalletsRelation) {
              const walletIds = [...new Set(connections.map((c) => c.wallet_id).filter(Boolean))];
              if (walletIds.length > 0) {
                const wallets = await query(
                  `SELECT id, address, kind FROM "wallets" WHERE id = ANY($1::uuid[])`,
                  [walletIds]
                );
                const walletMap = new Map(wallets.map((w) => [w.id, w]));
                for (const c of connections) {
                  c.wallets = walletMap.get(c.wallet_id) || null;
                }
              }
            }
            const connMap = new Map(connections.map((c) => [c.id, c]));
            for (const r of rows) {
              r.agent_connections = connMap.get(r.agent_id) || null;
            }
          }
        }
      } else if (this.tableName === 'payments') {
        if (hasMerchantsRelation) {
          const merchantIds = [...new Set(rows.map((r) => r.merchant_id).filter(Boolean))];
          if (merchantIds.length > 0) {
            const merchants = await query(
              `SELECT id, business_name, payout_address FROM "merchants" WHERE id = ANY($1::uuid[])`,
              [merchantIds]
            );
            const mtrMap = new Map(merchants.map((m) => [m.id, m]));
            for (const r of rows) {
              r.merchants = mtrMap.get(r.merchant_id) || null;
            }
          }
        }
      }
    }

    if (this.wantSingle) {
      if (rows.length === 1) {
        return { data: rows[0], error: null };
      }
      return {
        data: null,
        error: { message: rows.length === 0 ? 'JSON object not found' : 'Multiple rows found', code: 'PGRST116' },
      };
    }

    if (this.wantMaybeSingle) {
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    }

    return { data: rows, error: null };
  }

  private async executeInsert(): Promise<{ data: any; error: any }> {
    const isArray = Array.isArray(this.insertPayload);
    const items = isArray ? this.insertPayload : [this.insertPayload];
    if (items.length === 0) return { data: [], error: null };

    const insertedRows: any[] = [];
    for (const item of items) {
      const keys = Object.keys(item);
      const params: any[] = [];
      const colNames = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map((k) => {
        params.push(item[k]);
        return `$${params.length}`;
      }).join(', ');

      const sqlText = `INSERT INTO "${this.tableName}" (${colNames}) VALUES (${placeholders}) RETURNING *`;
      const rows = await query(sqlText, params);
      if (rows && rows.length > 0) {
        insertedRows.push(rows[0]);
      }
    }

    const data = isArray ? insertedRows : insertedRows[0] || null;
    return { data, error: null };
  }

  private async executeUpdate(): Promise<{ data: any; error: any }> {
    const keys = Object.keys(this.updatePayload || {});
    if (keys.length === 0) return { data: null, error: null };

    const params: any[] = [];
    const setClauses = keys.map((k) => {
      params.push(this.updatePayload[k]);
      return `"${k}" = $${params.length}`;
    });

    const whereSql = this.buildWhereClause(params);
    const sqlText = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')}${whereSql} RETURNING *`;
    const rows = await query(sqlText, params);

    if (this.wantSingle) {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }

  private async executeDelete(): Promise<{ data: any; error: any }> {
    const params: any[] = [];
    const whereSql = this.buildWhereClause(params);
    const sqlText = `DELETE FROM "${this.tableName}"${whereSql} RETURNING *`;
    const rows = await query(sqlText, params);
    return { data: rows, error: null };
  }

  private async executeUpsert(): Promise<{ data: any; error: any }> {
    const isArray = Array.isArray(this.insertPayload);
    const items = isArray ? this.insertPayload : [this.insertPayload];
    if (items.length === 0) return { data: [], error: null };

    let conflictCol = this.upsertOptions?.onConflict || 'id';
    if (this.tableName === 'indexer_cursors') {
      conflictCol = 'chain_id, event_name';
    } else if (this.tableName === 'cards') {
      conflictCol = 'card_id_hash';
    }

    const results: any[] = [];
    for (const item of items) {
      const keys = Object.keys(item);
      const params: any[] = [];
      const colNames = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map((k) => {
        params.push(item[k]);
        return `$${params.length}`;
      }).join(', ');

      const updateSet = keys
        .filter((k) => !conflictCol.split(',').map((c) => c.trim()).includes(k))
        .map((k) => `"${k}" = EXCLUDED."${k}"`)
        .join(', ');

      const conflictTarget = conflictCol.includes(',')
        ? conflictCol.split(',').map((c) => `"${c.trim()}"`).join(', ')
        : `"${conflictCol}"`;

      const sqlText = `
        INSERT INTO "${this.tableName}" (${colNames}) 
        VALUES (${placeholders}) 
        ON CONFLICT (${conflictTarget}) 
        DO UPDATE SET ${updateSet || 'id = EXCLUDED.id'} 
        RETURNING *
      `;

      const rows = await query(sqlText, params);
      if (rows && rows.length > 0) results.push(rows[0]);
    }

    return { data: isArray ? results : results[0] || null, error: null };
  }
}

/**
 * Neon Database Client adapter mimicking Supabase PostgREST & Auth client,
 * backed entirely by Neon Postgres via '@neondatabase/serverless'.
 */
export class NeonDatabaseClient {
  from(tableName: string) {
    return new NeonQueryBuilder(tableName);
  }

  async rpc(functionName: string, params: Record<string, any> = {}): Promise<{ data: any; error: any }> {
    try {
      const keys = Object.keys(params);
      const values = Object.values(params);
      const paramPlaceholders = values.map((_, i) => `$${i + 1}`).join(', ');

      // Run stored procedure on Neon
      const sqlText = `SELECT public.${functionName}(${paramPlaceholders}) as result`;
      const rows = await query(sqlText, values);
      const result = rows && rows.length > 0 ? rows[0].result : null;
      return { data: result, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || String(err) } };
    }
  }

  auth = {
    getUser: async (token?: string): Promise<{ data: { user: any | null }; error: any }> => {
      if (!token) {
        return { data: { user: null }, error: { message: 'No authorization token provided' } };
      }

      try {
        // 1. If it's a JWT, parse payload sub
        let userId: string | null = null;
        let userEmail: string | null = null;
        let rawMeta: any = {};

        if (token.includes('.')) {
          const parts = token.split('.');
          if (parts.length >= 2) {
            try {
              const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              userId = decoded.sub || decoded.id;
              userEmail = decoded.email;
              rawMeta = decoded.user_metadata || {};
            } catch {
              // fallback
            }
          }
        } else {
          // Token is a raw user ID or token string
          userId = token;
        }

        if (userId) {
          const users = await query<any>(
            `SELECT id, email, phone, raw_user_meta_data, created_at FROM auth.users WHERE id::text = $1 OR email = $1 LIMIT 1`,
            [userId]
          );

          if (users && users.length > 0) {
            const u = users[0];
            return {
              data: {
                user: {
                  id: u.id,
                  email: u.email,
                  phone: u.phone,
                  user_metadata: u.raw_user_meta_data || {},
                  created_at: u.created_at,
                },
              },
              error: null,
            };
          }

          // If valid UUID format, upsert into auth.users so foreign keys succeed
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(userId)) {
            const newUsers = await query<any>(
              `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET updated_at = NOW() RETURNING *`,
              [userId, userEmail || `user_${userId.slice(0, 8)}@paidx.app`, JSON.stringify(rawMeta)]
            );
            const u = newUsers[0];
            return {
              data: {
                user: {
                  id: u.id,
                  email: u.email,
                  phone: u.phone,
                  user_metadata: u.raw_user_meta_data || {},
                  created_at: u.created_at,
                },
              },
              error: null,
            };
          }
        }

        return { data: { user: null }, error: { message: 'User not found' } };
      } catch (err: any) {
        return { data: { user: null }, error: { message: err?.message || 'Authentication error' } };
      }
    },
    admin: {
      getUserById: async (id: string) => {
        const users = await query<any>(
          `SELECT id, email, phone, raw_user_meta_data, created_at FROM auth.users WHERE id::text = $1 LIMIT 1`,
          [id]
        );
        if (users && users.length > 0) {
          return { data: { user: users[0] }, error: null };
        }
        return { data: { user: null }, error: { message: 'User not found' } };
      },
    },
  };
}

let cachedNeonClient: NeonDatabaseClient | null = null;

export function getNeonDatabaseClient(): NeonDatabaseClient {
  if (!cachedNeonClient) {
    cachedNeonClient = new NeonDatabaseClient();
  }
  return cachedNeonClient;
}
