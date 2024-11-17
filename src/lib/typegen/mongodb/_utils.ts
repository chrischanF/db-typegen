import { camelcase, ucfirst } from '../shared';

export function createRequesters(schemas: any, config: any) {
  const requesters = [];
  for (const { tables } of schemas) {
    for (const { table, columns } of tables) {
      const name = config?.format === 'camelCase' ? ucfirst(camelcase(table.toLowerCase())) : table.toLowerCase();
      const methods = generateRequesterMethod(table, columns, config);
      requesters.push(`/* ${table} */`);
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

export function mongodbToTs(value: unknown, config?: any): string {
  if (Array.isArray(value)) {
    if (value.length > 0) {
      return `${mongodbToTs(value[0], config)}[]`;
    }
    return 'any[]';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (value === null || value === undefined) {
    return 'any';
  }
  if (typeof value === 'object') {
    if (!value || !Object.keys(value).length) return 'object'; // return `object` type if empty, to prevent object.prop = 1
    const obj = [`{`];
    for (const [key, val] of Object.entries(value)) {
      key && obj.push(`${key}?: ${mongodbToTs(val, config)}`);
      !key && obj.push(`${mongodbToTs(val, config).replace('{', '').replace('}', '')}`);
    }
    if (config?.experimentals?.strict !== true && !obj.includes('[key: string]: any')) {
      obj.push(`[key: string]: any`);
    }
    obj.push(`}`);
    return obj.join(`\n`); // You could make this more strict by inferring nested types
  }

  return 'any';
}

// Generate a Requester method for each table
function generateRequesterMethod(table: string, columns: any, { architecture, format, experimentalResolvers, splitTypings }: any): string {
  const typeName = ucfirst(camelcase(table));
  const methodName = format === 'camelCase' ? typeName : `_${table}`;
  const requester = [];
  const typing = splitTypings === true ? `Typed.${typeName}` : typeName;
  // Select
  const select = [
    `
    export async function select${methodName}<T extends ${typing}, O extends FindOptions<${typing}>>(
    filter: Filter<T> = {},
    options?: O
    ): Promise<${typing}[] | null> {
      return await mongodb.select('${table}', filter, options)
    };
  `,
  ];

  const insert = [
    `
    export async function insert${methodName}<T extends ${typing} | ${typing}[]>(document: T, options?: InsertOptions): Promise<T | null> {
      return await mongodb.insert<T>('${table}', document, options);
    };
  `,
  ];
  const update = [
    `
    export async function update${methodName}<T extends ${typing}>(filter: Partial<T>, document: T, options?: UpdateOptions): Promise<${typing} | null> {
      return await mongodb.update<T>('${table}', filter, document, options);
    };
  `,
  ];
  const del = [
    `
    export async function delete${methodName}<T extends ${typing}>(filter: Partial<T>, options?: DeleteOptions): Promise<DeleteResult | null> {
      return await mongodb.delete<T>('${table}', filter, options);
    };
  `,
  ];

  // columns
  if (experimentalResolvers === true) {
    for (const { column_name: col } of columns) {
      const colName = format === 'camelCase' ? `${methodName}By${ucfirst(camelcase(col))}` : `${methodName}_by_${col.toLowerCase()}`;

      select.push(`
      export async function select${colName}<O extends FindOptions<Pick<${typing}, '${col}'>>>(
        ${col}: ${typing}['${col}'],
        options?: O,
      ): Promise<${typing}[] | null> {
        return await mongodb.select<${typing}>('${table}', { ${col} }, options)
      }
    `);

      update.push(`
      export async function update${colName}<T extends ${typing}>(
        ${col}: ${typing}['${col}'],
        document: T,
        options?: UpdateOptions,
      ): Promise<${typing} | null> {
        return await mongodb.update<${typing}>('${table}', { ${col} }, document, options)
      }
    `);
    }
  }

  requester.push(select.join('\n'));
  requester.push(insert.join('\n'));
  requester.push(update.join('\n'));
  requester.push(del.join('\n'));

  if (architecture === 'class') {
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
