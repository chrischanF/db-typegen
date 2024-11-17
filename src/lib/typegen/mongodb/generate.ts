import { MongoClient } from 'mongodb';
import { createRequesters, mongodbToTs } from './_utils';
import { createInterfaces, createSplitTypesImports, createTableVariables, getTemplate } from '../shared';

export default async function main(config: any) {
  const {
    mongodb: { dbConfig },
    splitTypings,
  } = config;
  try {
    const { uri, host, port, database } = dbConfig;
    const client: MongoClient = await MongoClient.connect(uri || `mongodb://${host}:${port}`);
    const db = client.db(database);

    const schemas = await getSchemas(db, config.mongodb);
    const interfaces = createInterfaces(schemas, config);
    const requesters = createRequesters(schemas, config);
    const tableVariables = createTableVariables(schemas);
    const splitTypes = createSplitTypesImports();
    const utilImports = createUtilImports();

    client.close();
    const code = [utilImports, tableVariables, requesters];
    if (!splitTypings) {
      code.splice(3, 0, interfaces);
    } else {
      code.unshift(splitTypes);
    }

    return {
      code: code.join(`\n`),
      types: !splitTypes ? '' : interfaces,
    };
  } catch (e) {
    console.error(e.toString());
    return '';
  }
}

function createUtilImports() {
  return `
    import {
      mongodb,
      DeleteOptions,
      DeleteResult,
      Filter,
      FindOptions,
      InsertOptions,
      UpdateOptions
    }
    from 'db-typegen-utils';
 `;
}

async function getSchemas(db: any, config: any) {
  const collections = await db.collections();
  const _schemas = [
    {
      schema: '',
      tables: await Promise.all(
        collections.map(async (collection) => ({
          table: collection.collectionName,
          columns: await getSchemaTableColumns(collection),
        })),
      ),
    },
  ];

  return _schemas;
}

async function getSchemaTableColumns(collection: any) {
  const documents = await collection.find().toArray();
  const truthyDocuments = mergeObjects(documents);
  const columns = Object.entries(truthyDocuments).reduce((a, [docKey, docVal]) => {
    a.push({
      column_name: docKey,
      is_nullable: 'YES',
      data_type: mongodbToTs(docVal),
      column_default: null,
    });
    return a;
  }, []);

  return columns;
}

function mergeObjects(objectsArray) {
  return objectsArray?.reduce((merged, currentObj) => {
    if (typeof currentObj !== 'object') {
      return merged;
    }
    if ('_id' in currentObj) {
      delete currentObj._id;
    }
    for (const key in currentObj) {
      const currentValue = currentObj[key];
      const existingValue = merged[key];

      if (typeof currentValue === 'object' && !Array.isArray(currentValue) && currentValue !== null) {
        merged[key] = mergeObjects([existingValue || {}, currentValue]);
      } else if (currentValue) {
        // If the value is truthy
        merged[key] = currentValue;
      }
    }
    return merged;
  }, {});
}
