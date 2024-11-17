// @ts-nocheck
// PG
import { Pool } from 'pg';
require('dotenv').config();

export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type BuiltQuery = { query: string; values: unknown[] };
export type PoolClient = Awaited<ReturnType<typeof pool.connect>>;
export type FilterCondition<T> = {
  $eq?: T;
  $neq?: T;
  $lt?: T;
  $lte?: T;
  $gt?: T;
  $gte?: T;
};
export type LogicalOperators<T> = {
  $and?: Filter<T>[];
  $or?: Filter<T>[];
};
export type Filter<T> = {
  [key in keyof T]?: FilterCondition<T[key]> | T[key];
} & LogicalOperators<T>;

export interface Relationship {
  ftable: string;
  fkey: string;
  ltable: string;
  lkey: string;
  relationship: '1:1' | '1:M';
  relationships?: Relationship[];
}
export interface FindOptionsPG<T> {
  columns?: (keyof T)[];
  limit?: number;
  skip?: number;
  sort?: { [key in keyof T]?: 'ASC' | 'DESC' };
  debug?: boolean;
  relationships?: Relationship[];
}

export type SelectResult<T, O extends FindOptionsPG<T>> = O extends { debug: true }
  ? { query: string; result: T[] }
  : O['columns'] extends Array<keyof T>
    ? Pick<T, O['columns'][number]>[]
    : T[];

export const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: +process.env.PG_PORT!,
});

export async function executeQuery(table: string, options: any = {}) {
  const { query, values } = buildSelectOptions(table, options)!;
  try {
    const response = await pool.query(query, values);
    let result = response.rows;
    if (options?.debug) {
      console.log(`Query: `, query);
    }
    if (options?.relationships?.length) {
      result = result[0].jsonb_agg;
      return options?.debug === true ? { query, result } : result;
    }
    return options?.debug === true ? { query, result } : result;
  } catch (e) {
    console.log('Error: ', String(e));
  }
  return null;
}

export async function executeInsert<T>(table: string, document: T) {
  try {
    const { query, values } = buildInsertQuery(table, document);
    return withTransaction(async (client: PoolClient) => {
      const result = await client.query(query, values);
      return result.rows[0] || null;
    });
  } catch (e) {
    console.error(e.toString());
  }
  return null;
}

export async function executeUpdate<T>(table: string, filter: Partial<T>, document: T) {
  try {
    const { query, values } = buildUpdateQuery(table, filter, document);
    return withTransaction(async (client: PoolClient) => {
      const result = await client.query(query, values);
      return result.rows[0] || null;
    });
  } catch (e) {
    console.error(e.toString());
  }
}

export async function executeDelete<T>(table: string, filter: Partial<T>) {
  try {
    const { query, values } = buildDeleteQuery(table, filter);
    return withTransaction(async (client: PoolClient) => {
      const result = await client.query(query, values);
      return result.rows[0] || null;
    });
  } catch (e) {
    console.error(e.toString());
  }
}

export function RelationshipSubQuery(schema: string, relationships: Relationship[], parent?: string) {
  const table = relationships[0].ltable;
  const tableReferenceKey = relationships[0].lkey;
  const tableAlias = table.charAt(0);
  const query: string[] = [];
  let idx = 0;
  for (const rel of relationships) {
    const { ftable, fkey, relationship, relationships: nestedRelationship } = rel;
    const alias = `${ftable}_${idx}`;
    const isLast = idx === relationships.length - 1;
    const coalesce = relationship === '1:1' ? '{}' : '[]';
    query.push('\n');
    if (parent) {
      query.push(`'${ftable}', `);
    }
    if (!nestedRelationship?.length || coalesce === '[]') {
      query.push(`
      COALESCE((
        SELECT jsonb_agg(row_to_json(${alias})::jsonb)
        FROM ${schema}.${ftable} AS ${alias}
        WHERE ${alias}.${fkey} = ${parent || tableAlias}.${tableReferenceKey}
      ), '${coalesce}'::jsonb)${parent ? (!isLast || nestedRelationship?.length ? ',' : '') : ` AS ${ftable}${!isLast ? ',' : ''}`}
    `);
    } else {
      query.push(`
      COALESCE((
        SELECT row_to_json(${alias})::jsonb || jsonb_build_object(
          ${RelationshipSubQuery(schema, nestedRelationship, alias)}
        )
        FROM ${schema}.${ftable} AS ${alias}
        WHERE ${alias}.${fkey} = ${parent || tableAlias}.${tableReferenceKey}
      ), NULL) ${isLast ? `AS ${ftable}` : ','}
      `);
    }

    idx++;
  }

  return query.join('');
}

export function RelationshipQuery(schema, options): { query: string; values: string[] } {
  const { relationships, filter } = options;
  const tableAlias = relationships[0].ltable.charAt(0);

  const subQuery = RelationshipSubQuery(schema, relationships).trim();

  let counter = 1;
  let q = '';
  const queryTail = buildQueryTail(options, counter);

  // TODO: experimentalResolvers: make it support the `LogicalOperators`
  // This will be always `=`
  if (filter) {
    const {
      values: [val],
      query,
    } = buildWhereClause(filter, counter);
    q = query.replace('table_data', tableAlias).replace('$1', '');
    q = `WHERE ${q} ${typeof val === 'string' ? `'${val}'` : val}`;
  }
  const query = [
    `
    WITH table_data AS (
      SELECT
        ${tableAlias}.*,
        ${subQuery}
      FROM ${schema}.${relationships[0].ltable} ${tableAlias}
      ${q}
      GROUP BY ${tableAlias.charAt(0)}.${relationships[0].lkey}
      ${queryTail.query}
    )
      SELECT jsonb_agg(row_to_json(table_data)::jsonb)
      FROM table_data
  `,
  ];

  return {
    query: query.join('\n'),
    values: queryTail.values,
  };
}

export function buildQueryTail(options, counter) {
  const { filter, limit, skip, sort, columns } = options;
  const query = [];
  const values = [];
  if (sort && !!Object.keys(sort).length) {
    const sortConditions = Object.entries(sort)
      .map(([key, direction]) => `${key} ${direction}`)
      .join(', ');
    if (sortConditions) {
      query.push(`ORDER BY ${sortConditions}`);
    }
  }

  if (limit && typeof limit === 'number') {
    query.push(`LIMIT $${counter++}`);
    values.push(limit);
  }

  if (skip && typeof skip === 'number') {
    query.push(`OFFSET $${counter++}`);
    values.push(skip);
  }

  return { query: query.join('\n'), values };
}

export function buildSelectOptions<T>(table: string, options: Partial<FindOptionsPG<T> & { filter: Filter<T> }> = {}) {
  if (!options) return null;
  const { filter, limit, skip, sort, columns } = options;

  /**
   * lt = local table
   * ft = foreign table
   */
  if (options?.relationships) {
    return RelationshipQuery(table.split('.')[0], options);
  }

  const values: any[] = [];
  const query = [`SELECT ${columns?.length ? columns.join(', ') : '*'} FROM ${table} table_data`];
  let counter = 1;

  if (filter) {
    const whereClause = buildWhereClause(filter, counter);
    if (whereClause.query) {
      query.push(`WHERE ${whereClause}`);
      values.push(...whereClause.values);
      counter += whereClause.counter;
    }
  }

  const queryTail = buildQueryTail(options, counter);
  if (queryTail.query) {
    query.push(queryTail.query);
    values.push(...queryTail.values);
  }

  return { query: query.join('\n'), values };
}

export function buildWhereClause<T>(filter: Filter<T>, counter: number) {
  const conditions: string[] = [];
  const values: any[] = [];
  const operatorMap = {
    $eq: '=',
    $neq: '<>',
    $lt: '<',
    $lte: '<=',
    $gt: '>',
    $gte: '>=',
  };

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or' || key === '$and') {
      const logicalConditions = (value as Filter<T>[]).map((innerFilter) => {
        const { query, values: innerValues } = buildWhereClause(innerFilter, counter);
        counter += innerValues.length;
        values.push(...innerValues);
        return `(${query})`;
      });
      conditions.push(logicalConditions.join(` ${key === '$or' ? 'OR' : 'AND'} `));
    } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      for (const [operator, operatorValue] of Object.entries(value as FilterCondition<any>)) {
        const comparison = operatorMap[operator];
        if (!comparison) throw new Error(`Unknown operator: ${operator}`);
        conditions.push(`table_data.${key} = $${counter++}`);
        values.push(operatorValue);
      }
    } else {
      conditions.push(`table_data.${key} = $${counter++}`);
      values.push(value);
    }
  }

  return { query: conditions.join(' AND '), values, counter };
}

function isValidObject(object: unknown): boolean {
  return !(!object || typeof object !== 'object' || Array.isArray(object) || !Object.keys(object).length);
}

export function buildInsertQuery<T>(table: string, document: T): Partial<BuiltQuery> {
  if (!isValidObject(document)) {
    throw new Error(
      `Invalid insert data.\nReceived: ${JSON.stringify(document, null, 2)}\nExpecting:\n${JSON.stringify(schema[table], null, 2)}`,
    );
  }
  const columns = Object.keys(document!);
  const values = Object.values(document!);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const query = `INSERT INTO ${table} (${columns.map((col) => `"${col}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
  return { query, values };
}

export function buildUpdateQuery<T>(table: string, filter: T, document: T): Partial<BuiltQuery> {
  // Dynamically generate the UPDATE query
  if (!isValidObject(filter)) {
    throw new Error(
      `Invalid filter data.\nReceived: ${JSON.stringify(filter, null, 2)}\nExpecting:\nPartial<${JSON.stringify(schema[table], null, 2)}>`,
    );
  }
  if (!isValidObject(document)) {
    throw new Error(
      // @ts-ignore
      `Invalid update data.\nReceived: ${JSON.stringify(document, null, 2)}\nExpecting:\n${JSON.stringify(schema[table], null, 2)}`,
    );
  }
  const docKeys = Object.keys(document!);
  const docValues = Object.values(document!);
  const filterKeys = Object.keys(filter!);
  const filterValues = Object.values(filter!);
  const updateSet = docKeys.map((key, i) => `"${key}" = $${i + 1}`).join(', ');
  const filterCondition = filterKeys.map((key, i) => `${key} = $${i + docKeys.length + 1}`).join(' AND ');

  const query = `UPDATE ${table} SET ${updateSet} WHERE ${filterCondition} RETURNING *`;
  return { query, values: docValues.concat(filterValues) };
}

export function buildDeleteQuery<T>(table: string, filter: T) {
  if (!isValidObject(filter)) {
    throw new Error(
      // @ts-ignore
      `Invalid filter data.\nReceived: ${JSON.stringify(filter, null, 2)}\nExpecting:\nPartial<${JSON.stringify(schema[table], null, 2)}>`,
    );
  }

  const filterValues = Object.values(filter!);
  const filterCondition = filterValues.map((key, i) => `${key} = $${i + 1}`).join(' AND ');

  const query = `DELETE FROM ${table} WHERE ${filterCondition}`;
  return { query, values: filterValues };
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Begin transaction
    const result = await callback(client); // Execute the callback function that performs the operation
    await client.query('COMMIT'); // Commit the transaction
    return result; // Return the result of the callback
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    console.error('Transaction failed:', error);
    return null; // Return null in case of failure
  } finally {
    client.release(); // Release the connection back to the pool
  }
}
