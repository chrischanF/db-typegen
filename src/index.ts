#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
import psql from './lib/typegen/postgresql/generate';
import mongod from './lib/typegen/mongodb/generate';
import { ucfirst } from './lib/typegen/shared';

const CONFIG_FILE = 'typegen.config.json';
const PRETTIERRC = '.prettierrc';

const TYPEGEN_DEFAULTS = {
  architecture: 'class',
  format: 'camelCase',
  experimentalResolvers: false,
  splitTypings: true,
  prettier: true,
  postgresql: {
    dbConfig: {
      user: 'postgres',
      host: 'localhost',
      database: '',
      password: 'password',
      port: 5432,
    },
    experimentals: {
      relationships: false,
    },
  },
  mongodb: {
    dbConfig: {
      user: '',
      host: 'localhost',
      database: '',
      password: 'password',
      port: 27017,
    },
    experimentals: {
      strict: false,
    },
  },
};

const main = async () => {
  console.time('Completion time');
  const config = loadConfig();
  const FILENAME = 'index.ts';
  const TYPEFILENAME = 'types.ts';
  const outputs = {
    postgresql: path.resolve(process.cwd(), config?.postgresql?.path ? config.postgresql.path : '__typegen__/postgresql'),
    mongodb: path.resolve(process.cwd(), config?.mongodb?.path ? config.mongodb.path : '__typegen__/mongodb'),
  };

  const mesh = {
    postgresql: await psql(config),
    mongodb: typeof config?.mongodb === 'object' ? await mongod(config) : null,
  };

  for await (const [db, path] of Object.entries(outputs)) {
    if (!mesh[db]?.code) continue;
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }

    const content = config.prettier === true ? await prettier.format(mesh[db].code, config._prettier) : mesh[db].code;
    fs.writeFileSync(`${path}/${FILENAME}`, content);
    if (config?.splitTypings === true && mesh[db].types) {
      const types = config.prettier === true ? await prettier.format(mesh[db].types, config._prettier) : mesh[db].types;
      fs.writeFileSync(`${path}/${TYPEFILENAME}`, types);
    }

    console.log(`${ucfirst(db)} generated at: ${path}`);
  }

  console.timeEnd('Completion time');
  process.exit(1);
};

const loadConfig = () => {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);
  const prettierPath = path.resolve(process.cwd(), PRETTIERRC);

  if (!fs.existsSync(configPath)) {
    console.error(`Error: ${CONFIG_FILE} not found at ${process.cwd()}.`);
    process.exit(1);
  }

  const config = Object.assign(TYPEGEN_DEFAULTS, JSON.parse(fs.readFileSync(configPath, 'utf8')));

  const datasources = [
    {
      name: 'postgresql',
      short: 'pg',
    },
    { name: 'mongodb', short: 'mongo' },
  ];
  const datasoureConfig = {
    postgresql: ['user', 'host', 'database', 'password', 'port'],
    mongodb: ['host', 'database', 'port'],
  };

  const dotEnvContent: string[] = [];
  for (const { name: datasource, short } of datasources) {
    if (config[datasource]) {
      dotEnvContent.push(`# ${datasource.toUpperCase()}`);
      for (const dbConfigKey of datasoureConfig[datasource]) {
        if (!(dbConfigKey in config[datasource].dbConfig) || !config?.[datasource]?.dbConfig?.[dbConfigKey]) {
          console.error(
            `Error: Missing dbConfig "${dbConfigKey}" on:\n${JSON.stringify({ [datasource]: { dbConfig: config[datasource].dbConfig } }, null, 2)}`,
          );
          process.exit(1);
        }
        dotEnvContent.push(`${short.toUpperCase()}_${dbConfigKey.toUpperCase()}=${config[datasource].dbConfig[dbConfigKey]}`);
      }
    }
  }

  // create .env in root dir
  const dotenvFile = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(`${dotenvFile}.sample`)) {
    fs.writeFileSync(`${dotenvFile}.sample`, dotEnvContent.join('\n'));
  }
  if (!fs.existsSync(dotenvFile)) {
    fs.writeFileSync(dotenvFile, dotEnvContent.join('\n'));
  }

  const prettierConfig = fs.existsSync(prettierPath)
    ? JSON.parse(fs.readFileSync(prettierPath, 'utf8'))
    : {
        trailingComma: 'all',
        tabWidth: 2,
        semi: true,
        singleQuote: true,
        bracketSpacing: true,
        printWidth: 120,
        useTabs: false,
      };
  return {
    ...config,
    _prettier: { ...prettierConfig, parser: 'typescript', printWidth: 9999 },
  };
};

main();
