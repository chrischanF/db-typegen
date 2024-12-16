# DB Typegen

Typescript Database ORM code generator.

## Features

- Generates typescript ORM (Current supported below)
  - MongoDB
  - PostgreSQL

## Prerequisite

- Node.js version >= 18

## Installation

Install the package globally.

```bash
npm install -g db-typegen
```

or

```bash
npm install db-typegen
```

## Setup

Create a `typegen.config.json` file on your project root directory

```
root
    -- node_modules
    |
    -- src
    |
    -- package.json
    |
    -- package-lock.json
    |
    -- typegen.config.json
```

## Example Configuration

```
{
  "$schema": "./node_modules/db-typegen/schema.json",
  "architecture": "functional",
  "format": "camelCase",
  "experimentalResolvers": true,
  "splitTypings": true,
  "prettier": true,
  "postgresql": {
    "dbConfig": {
      "user": "postgres",
      "host": "localhost",
      "database": "",
      "password": "password",
      "port": 5432
    },
    "schemas": ["table_one", "table_two"],
    "path": "src/__typegen__/postgresql",
    "experimentals": {
      "relationships": true
    }
  },
  "mongodb": {
    "dbConfig": {
      "host": "localhost",
      "database": "",
      "port": 27017
    },
    "path": "src/__typegen__/mongodb",
    "experimentals": {
      "strict": true
    }
  }
}
```

# Typegen Configuration

This document outlines the configuration schema for the `typegen.config.json` file used in your project.

## Configuration Schema

| Key                                          | Type                  | Description                                                                        |
| -------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `architecture`                               | `string`              | Programming style: 'class' or 'functional'.                                        |
| `format`                                     | `string`              | Naming Convention 'camelCase' or 'snake_case'.                                     |
| `experimentalResolvers`                      | `boolean`             | Creates methods for every table columns: true or false                             |
| `prettier`                                   | `boolean`             | Format generated code: true or false                                               |
| `splitTypings`                               | `boolean`             | Abstract types and interfaces in the `types.ts` file: true or false                |
| `postgresql`                                 | `object`              | PostgreSQL database configuration.                                                 |
| `postgresql`.`schemas` (New v1.1)            | `string[]`            | Specific schema to generate: ["table_one", "table_two"]                            |
| `postgresql`.`dbConfig`                      | `object`              | Configuration settings for PostgreSQL database connection: {}                      |
| `postgresql`.`dbConfig`.`user`               | `string`              | Database user: 'postgres'                                                          |
| `postgresql`.`dbConfig`.`host`               | `string`              | Database host: 'localhost'                                                         |
| `postgresql`.`dbConfig`.`database`           | `string`              | Database name: ''                                                                  |
| `postgresql`.`dbConfig`.`password`           | `string`              | Database password: 'password'                                                      |
| `postgresql`.`dbConfig`.`port`               | `integer`             | Database port: 5432                                                                |
| `postgresql`.`path`                          | `string`              | Directory to save the generated files: './src/**typegen**/postgresql'              |
| `postgresql`.`experimentals`                 | `object`              | Experimental features for PostgreSQL: {}                                           |
| `postgresql`.`experimentals`.`relationships` | `boolean`             | Include tables constraints / relationships for the `select` methods: true or false |
| `mongodb`                                    | `object` or `boolean` | MongoDB database configuration.                                                    |
| `mongodb`.`dbConfig`                         | `object`              | Configuration settings for MongoDB database connection: {}                         |
| `mongodb`.`dbConfig`.`host`                  | `string`              | Database host: 'localhost'                                                         |
| `mongodb`.`dbConfig`.`database`              | `string`              | Database name: ''                                                                  |
| `mongodb`.`dbConfig`.`port`                  | `integer`             | Database port: 27017                                                               |
| `mongodb`.`path`                             | `string`              | Directory to save the generated files: './src/**typegen**/mongodb'                 |
| `mongodb`.`experimentals`                    | `object`              | Experimental features for MongoDB: {}                                              |
| `mongodb`.`experimentals`.`strict`           | `boolean`             | Strict schema and typings: true or false                                           |

## Usage

Assuming you have completed the **Setup**. Enter the command on your terminal.

```
npx db-typegen
```

if installed globally, you may use

```
db-typegen
```

It should create a directory `__typegen__` in the root. Custom path for the generated files can be also provided using the `path` on your `typegen.config.json` configuration.

**Note** It will also create a file `.env.sample` just copy the content if you don't have `.env` yet.

## Limitations

When `experimentalResolvers` is set to `true` and `format` is `camelCase` there is a chance that the resolver methods will have a conflicting name e.g.

```
❌
// camelCase
Table: users
  column: id    -> selectUsersById
  column: __id  -> selectUsersById
  column: _id_  -> selectUsersById
  column: id__  -> selectUsersById

✅
// snake_case
Table: users
  column: id    -> select_users_by_id
  column: __id  -> select_users_by__id
  column: _id_  -> select_users_by_id_
  column: id__  -> select_users_by_id__
```

## Changelog

**1.1.9**
- Patched relationship `types` to be `[]`

**1.1.8**

- Added double quote delimiter for tables to avoid clashing with postgresql reserved words
- Removed `insert`, `update` and `delete` client schema check
- Improved `experimentalResolver` typings
- Improved `relationships` resolvers return types
- Improved `insert` statement return type
  - Introduced `PGInsertResult<T> - { insertedCount: number; data: T[] }`
- Improved `update` statement return type
  - Introduced `PGUpdateResult<T> - { updatedCount: number; data: T[] }`
- Improved `delete` statement return type
  - Introduced `PGDeleteResult<T> - { deletedCount: number }`
- Fixed `db-typegen-utils` import path
- Fixed undefined error on generate

**1.1.2**

- Removed default query logging
  - Though still shows when `PGFindOptions.debug` is `true`
- Fixed `experimentalResolver` methods `filter` args not working
  - Currently supports `=` by default

**1.1.0**

- Added support to explicit schema on `typegen.config.json`
  - Updated local schema table variables. Previously `TABLE_NAME`, now `SCHEMA_TABLE_NAME`
- Fixed `experimentalResolvers` javascript/typescript reserved words for column names
- Fixed `experimentalResolvers` clauses not working
- db-typegen-utils
  - Fixed select method `options` type suggest not working

**1.0.0**

- Initial release

## Contributing

Raise issue or pull request on: [https://github.com/chrischanF/db-typegen](https://github.com/chrischanF/db-typegen)
