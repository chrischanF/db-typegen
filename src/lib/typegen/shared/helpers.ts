import { readdirSync, readFileSync } from 'fs';

export function ucfirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function lcfirst(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function camelcase(str: string): string {
  if (!str) return str;
  const cleanedString = str.replace(/[\W_]+/g, ' ');
  const words = cleanedString.split(' ');
  const camelCasedWords = words.map((word, index) =>
    !index ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );

  return camelCasedWords.join('');
}

function createRelationshipInterfaces(relationships: any[]) {
  const columns = [];
  for (const { ftable, relationships: nestedRelationship, relationship: coalesce } of relationships) {
    const column: any = {
      column_name: ftable,
    };

    if (nestedRelationship?.length) {
      column.children = createRelationshipInterfaces(nestedRelationship);
    }
    column.coalesce = coalesce === '1:M' ? '[]' : '';
    columns.push(column);
  }

  return columns;
}

function mapInterfaces(columns: any[]): any {
  const obj = [];
  for (const { column_name, data_type, is_nullable, column_default, children = [], coalesce } of columns) {
    const nullable = is_nullable?.toLowerCase() === 'yes' || column_default !== null ? '?' : '';
    let dataType = parseDataType(data_type)?.length > 10 ? 'json' : data_type;
    if (children?.length || data_type === undefined) {
      dataType = ucfirst(camelcase(column_name));
    }
    if (!obj.includes('\n/* Relationships */\n') && children.length) {
      obj.push('\n/* Relationships */\n');
    }

    obj.push(`${column_name}${nullable}:`);
    if (data_type === undefined || children.length) {
      obj.push(dataType + coalesce);
    } else {
      obj.push(parseDataType(data_type));
    }
    obj.push('\n');
  }

  return obj;
}

export function createInterfaces(schemas: any, config?: any) {
  const types: Record<string, string[]> = {};
  const isExperimental = config?.postgresql?.experimentals?.relationships === true;
  for (const schema of schemas) {
    for (const { table, columns, relationships } of schema.tables) {
      let shadowColumns = columns;

      if (isExperimental && relationships?.length) {
        const relColumns = createRelationshipInterfaces(relationships);
        shadowColumns = shadowColumns.concat(relColumns);
      }

      types[table] = mapInterfaces(shadowColumns);
    }
  }

  const interfaces = [];
  for (const [table, fields] of Object.entries(types)) {
    const _interface = [];
    _interface.push(`export interface ${ucfirst(camelcase(table))} {`);
    for (const field of fields) {
      _interface.push(` ${field} `);
    }
    _interface.push(`}`);
    interfaces.push(_interface.join(``));
  }

  // process.exit(1);
  return interfaces.join(`\n`);
}

export function parseDataType(dataType) {
  switch (dataType) {
    case 'int':
    case 'smallint':
    case 'integer':
    case 'bigint':
    case 'decimal':
    case 'numeric':
    case 'real':
    case 'double precision':
    case 'double_precision':
    case 'smallserial':
    case 'serial':
    case 'bigserial':
      return 'number';
    case 'timestamp':
    case 'date':
    case 'time':
    case 'interval':
      return 'Date | string';
    case 'boolean':
      return 'boolean';
    case 'jsonb':
    case 'json':
    case 'object':
      return `any`;
    case 'uuid':
    case 'text':
    case 'timestamp without time zone':
    case 'character varying':
      return 'string';
    // mongo typings
    default:
      return dataType; // Extend as needed
  }
}

export function pgTableVar(schema: string, table: string): string {
  return `${schema.toUpperCase().replaceAll(/\W/gi, '_')}_${table.toUpperCase().replaceAll(/\W/gi, '_')}`;
}

export function createTableVariables(schemas: any) {
  const vars = [];
  const schemaVars = [];
  vars.push(`/* Table names */`);
  for (const { schema, tables } of schemas) {
    for (const { table } of tables) {
      // vars.push(`export const ${table.replaceAll(/\W/gi, '_')} = '${table}'`);
      if (schema) {
        schemaVars.push(`const ${pgTableVar(schema, table)} = '${schema}.${table}'`);
      }
    }
  }

  schemaVars.unshift(`/* Schema table names */`);

  return [schemaVars.join('\n'), vars.join('\n')].join(`\n`);
}

export function createSplitTypesImports() {
  return `import type * as Typed from './types'`;
}

export function getTemplate(path: string) {
  if (!path) return '';
  const folder = path.split('/');
  const base = __dirname
    .split('/')
    .filter((path) => path !== 'shared')
    .join('/');
  const basePath = `${base}/${folder.at(1)}`;
  const files = readdirSync(basePath, 'utf-8');
  if (files.length) {
    const fileName = folder.at(-1);
    const template = files.find((file) => file.includes(fileName));
    if (template) {
      return readFileSync(`${basePath}/${template}`, 'utf8');
    }
  }
}

export const customReservedWords = ['options'];
export const reservedWords = [
  ...customReservedWords,
  'abstract',
  'arguments',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
];
