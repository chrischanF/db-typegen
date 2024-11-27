import { Pool } from 'pg';
import { createRequesters, createSchemaMeta } from './_utils';
import { createInterfaces, createSplitTypesImports, createTableVariables } from '../shared';

export default async function main(config: any) {
  const {
    postgresql: { dbConfig },
    splitTypings,
  } = config;

  const pool = new Pool({
    user: dbConfig.user || process.env.PG_USER,
    host: dbConfig.host || process.env.PG_HOST,
    database: dbConfig.database || process.env.PG_DATABASE,
    password: dbConfig.password || process.env.PG_PASSWORD,
    port: dbConfig.port || process.env.PG_PORT,
  });

  const schemas = await getSchemas(pool, config);
  const interfaces = createInterfaces(schemas, config);
  const relationshipVars = config.postgresql.experimentals?.relationships === true ? createRelationshipVars(schemas) : '';
  const requesters = createRequesters(schemas, config);
  const tableVariables = createTableVariables(schemas);
  const schemaMeta = ''; // createSchemaMeta(schemas);
  const splitTypes = createSplitTypesImports();
  const utilImports = createUtilImports();

  pool.end();
  const code = [utilImports, schemaMeta, relationshipVars, tableVariables, requesters];
  if (!splitTypings) {
    code.splice(3, 0, interfaces);
  } else {
    code.unshift(splitTypes);
  }

  return {
    code: code.join('\n'),
    types: !splitTypes ? '' : interfaces,
  };
}

function createUtilImports() {
  const importPath = process.env.NODE_ENV === 'development' ? `'../../../deps/db-typegen-utils/src'` : `'db-typegen-utils'`;
  return `
    import {
      Relationship,
      SelectResult,
      executeQuery,
      Filter,
      executeInsert,
      executeUpdate,
      executeDelete,
      PGFindOptions,
      PGInsertResult,
      PGUpdateResult,
      PGDeleteResult,
      AnyObject,
    } from ${importPath}
  `;
}

async function getSchemaTableColumns(pool: any, schema: string, table: string) {
  return (
    await pool.query(
      `
      SELECT *
      FROM information_schema.columns
      WHERE table_schema = $1
      AND table_name = $2;
      `,
      [schema, table],
    )
  ).rows;
}

async function getSchemaTables(pool: any, schema: string, config: any) {
  const tables = (
    await pool.query(
      `
          SELECT table_name AS table
          FROM information_schema.tables
          WHERE table_schema = $1
      `,
      [schema],
    )
  ).rows;
  return await Promise.all(
    tables
      .filter(({ table }) => (config?.tables?.length ? config.tables.includes(table) : true))
      .map(async ({ table }) => {
        const relationships = await getTableRelationships(pool, table);
        const columns = await getSchemaTableColumns(pool, schema, table);
        const values: any = { table };
        if (relationships?.length) {
          values.relationships = relationships;
        }
        if (columns?.length) {
          values.columns = columns;
        }
        return values;
      }),
  );
}

function createRelationshipVars(schemas) {
  const vars = {};
  for (const { schema, tables } of schemas) {
    for (const { table, relationships } of tables) {
      vars[`${schema}.${table}`] = relationships;
    }
  }

  const relationships = [
    `
      const _relationships: { [key: string]: Relationship[] } = ${JSON.stringify(vars)};
  `,
  ];
  return relationships.join('\n');
}

async function getTableRelationships(pool: any, table: string) {
  const relationships = await pool.query(
    `
      WITH foreign_key_info AS (
      SELECT
          tc.constraint_name AS constraint,
          tc.table_name AS ftable,
          kcu.column_name AS fkey,
          ccu.table_name AS ltable,
          ccu.column_name AS lkey,
          -- Check if the child column is part of a UNIQUE or PRIMARY KEY constraint
          CASE
              WHEN EXISTS (
                  SELECT 1
                  FROM information_schema.table_constraints AS uc
                  JOIN information_schema.key_column_usage AS ukcu
                      ON uc.constraint_name = ukcu.constraint_name
                      AND uc.table_schema = ukcu.table_schema
                  WHERE uc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
                      AND uc.table_name = kcu.table_name
                      AND ukcu.column_name = kcu.column_name
              )
              THEN '1:1'
              ELSE '1:M'
          END AS relationship
      FROM
          information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
      WHERE
          tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = '${table}'
  )
  SELECT * FROM foreign_key_info;`,
  );

  relationships.rows = await Promise.all(
    relationships.rows.map(async (row) => {
      delete row.constraint;
      const relation = await getTableRelationships(pool, row.ftable);
      if (relation?.length) {
        row.relationships = relation;
      }
      return row;
    }),
  );

  return relationships.rows?.length ? relationships.rows : [];
}

async function getSchemas(pool: any, config: any) {
  const pgSchema = [];
  if (config.postgresql?.schemas?.length) {
    const where = [];
    for (const schema of config.postgresql?.schemas) {
      where.push(`nspname = '${schema}'`);
    }

    pgSchema.push(`AND (${where.join(' OR ')})`);
  }
  const schemaQuery = `SELECT nspname AS schema
    FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_%'
    AND nspname != 'information_schema'
    AND nspname != 'public'
    ${pgSchema.join('\n')}
    ORDER BY nspname;`;

  const schemas = (await pool.query(schemaQuery)).rows;
  return await Promise.all(
    schemas.map(async ({ schema }) => ({
      schema,
      tables: await getSchemaTables(pool, schema, config),
    })),
  );
}
