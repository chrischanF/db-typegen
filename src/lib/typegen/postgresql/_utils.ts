import { camelcase, parseDataType, pgTableVar, reservedWords, ucfirst } from '../shared';

export function createRequesters(schemas: any, config: any) {
  const requesters = [];
  for (const { schema, tables } of schemas) {
    for (const table of tables) {
      const name = config?.format === 'camelCase' ? ucfirst(camelcase(table.table.toLowerCase())) : table.table.toLowerCase();
      const methods = generateRequesterMethodV2({ schema, ...table }, config);
      requesters.push(`/* ${table.table} */`);
      if (config?.architecture === 'class') {
        requesters.push(`
          export class ${name} {${methods}}
        `);
      } else {
        requesters.push(methods);
      }
    }
  }

  return requesters.join(`\n`);
}

export function createSchemaMeta(schemas: any) {
  const schemaMeta = schemas.reduce((a, { schema, tables }) => {
    for (const { table, columns } of tables) {
      if (!a[table]) {
        a[table] = {};
      }
      for (const { column_name, data_type, is_nullable, column_default } of columns) {
        const nullable = is_nullable.toLowerCase() === 'yes' || column_default !== null ? '?' : '';
        a[table][column_name] = {
          type: parseDataType(data_type),
          required: !nullable,
        };
      }
    }
    return a;
  }, {});

  return `export const schema = ${JSON.stringify(schemaMeta)}`;
}

function getExperimentalResolver(schema: string, table: string, relationships: any, column: string, config) {
  // Select
  const isUpperCaseCol = column === column.toUpperCase();
  let methodName = config.format === 'camelCase' ? ucfirst(camelcase(table)) : `_${table}`;
  if (column) {
    if (!isUpperCaseCol) {
      methodName = methodName + (config.format === 'camelCase' ? `By${ucfirst(camelcase(column))}` : `_by_${column}`);
    } else {
      methodName = methodName + (config.format === 'camelCase' ? `By${column}` : `by_${column}`);
    }
  }
  const typeName = ucfirst(camelcase(table));
  const typing = config.splitTypings === true ? `Typed.${typeName}` : typeName;
  const tableVar = pgTableVar(schema, table);

  const param = `${reservedWords.includes(column) ? `${column}: _${column}` : column}`;
  const arg = reservedWords.includes(column) ? `_${column}` : column;
  const select = [
    `
    export async function select${methodName}<T extends ${typing}, O extends PGFindOptions<T>>(
    ${arg}?: ${typing}['${column}'],
    options?: O
    ): Promise<SelectResult<T, O> | null> {
  `,
  ];
  if (config?.postgresql?.experimentals?.relationships === true && relationships?.length) {
    select.push(`
      return  (await executeQuery(
        ${tableVar},
        {
          ...options,
          filter: { ${param} },
          relationships: _relationships[${tableVar}]
        }
      ));
    }`);
  } else {
    select.push(`
      return await executeQuery(
        ${tableVar},
        {
          ...options,
          filter: { ${param} },
        }
      );
    }
      `);
  }

  return select.join(`\n`);
}

/**
 * Generate a Requester method for each table
 * @returns resolvers (slow)
 */
function generateRequesterMethodV2(tableMeta: any, config: any): string {
  const { table, relationships, columns, schema } = tableMeta;
  const methodName = config.format === 'camelCase' ? ucfirst(camelcase(table)) : `_${table}`;
  const typeName = ucfirst(camelcase(table));
  const typing = config.splitTypings === true ? `Typed.${typeName}` : typeName;
  const requester = [];
  // Select
  const filterType = typing + (config?.postgresql?.experimentals?.strict === false ? ' & AnyObject' : '');
  const select = [
    `
    export async function select${methodName}<T extends ${typing}, O extends PGFindOptions<T>>(
    filter?: Filter<${filterType}>,
    options?: O
    ): Promise<SelectResult<T, O> | null> {
  `,
  ];
  const tableVar = pgTableVar(schema, table);
  if (config.postgresql?.experimentals?.relationships === true && relationships?.length) {
    select.push(`
      return  (await executeQuery(
        ${tableVar},
        {
          ...options,
          filter,
          relationships: _relationships[${tableVar}]
        }
      ));
    }`);
  } else {
    select.push(`
      return await executeQuery(
        ${tableVar},
        {
          ...options,
          filter,
        }
      );
    }
      `);
  }

  const insert = [
    `
    export async function insert${methodName}(document: ${typing}): Promise<PGInsertResult<${typing}>> {
      return await executeInsert(${tableVar}, document);
    };
  `,
  ];
  const update = [
    `
    export async function update${methodName}(filter: Partial<${typing}>, document: ${typing}): Promise<PGUpdateResult<${typing}>> {
      return await executeUpdate(${tableVar}, filter, document);
    };
  `,
  ];
  // columns
  if (config.experimentalResolvers === true) {
    const uniqueColumns: string[] = [...new Set(columns.map(({ column_name }) => column_name))] as string[];
    for (const col of uniqueColumns) {
      const experimentalResolver = getExperimentalResolver(schema, table, relationships, col, config);
      select.push(experimentalResolver);
    }
  }

  const del = [
    `
    export async function delete${methodName}(filter: Partial<${typing}>): Promise<PGDeleteResult> {
      return await executeDelete(${tableVar}, filter);
    };
  `,
  ];

  requester.push(select.join('\n'));
  requester.push(insert.join('\n'));
  requester.push(update.join('\n'));
  requester.push(del.join('\n'));

  if (config.architecture === 'class') {
    return requester
      .join(`\n`)
      .replaceAll('export async function', 'public static async')
      .replaceAll(`select${methodName}`, 'select')
      .replaceAll(`insert${methodName}`, 'insert')
      .replaceAll(`update${methodName}`, 'update')
      .replaceAll(`delete${methodName}`, 'delete');
  }
  return requester.join(`\n`);
}
