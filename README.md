DB Typegen sauce 

## Prerequisite

- Node.js version >= 18

## Setup

Install dependencies

- `npm install`
- Update database connections on `typegen.config.json`

## Project structure

deps - Dependency packages

# How to
- Test changes
  - `npm run build`
  - `npx ts-node 'path/datasource/index.ts'`
    - example: `npx ts-node '__typegen__/postgresql/index.ts`


## Changelog


**1.1.2**
- Removed default query logging
  - Though still shows when `FindOptionsPG.debug` is `true`
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