DB Typegen sauce

## Prerequisite

- Node.js version >= 18

## Setup

Install dependencies

- `npm install`
- Update database connections on `typegen.config.json`

## Project structure

deps - Dependency packages
src - Main db-typegen package

# How to

- Test changes

  - `npm run generate` // This will generate the `index.ts` and related files
  - `npx ts-node 'path/datasource/index.ts'`
    - example: `npx ts-node __typegen__/postgresql/index.ts`

- Submit pull request
  - Don't forget to update [https://github.com/chrischanF/db-typegen/tree/main/src](db-typegen README)

**See** [https://github.com/chrischanF/db-typegen/tree/main/src](db-typegen README) for more

## Changelog

**1.1.7**

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
