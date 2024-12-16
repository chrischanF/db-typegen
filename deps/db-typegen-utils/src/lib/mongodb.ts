// @ts-nocheck
import {
  MongoClient,
  FindOptions as _FindOptions,
  Db,
  Document,
  ClientSession,
  UpdateOptions as _UpdateOptions,
  InsertOneOptions as _InsertOptions,
  Collection,
  DeleteOptions as _DeleteOptions,
  DeleteResult as _DeleteResult,
} from 'mongodb';
require('dotenv').config();

export interface FindOptions<T> extends _FindOptions, WithTransaction {}
export interface UpdateOptions extends _UpdateOptions, WithTransaction {}
export interface InsertOptions extends _UpdateOptions, WithTransaction {}
export interface DeleteOptions extends _DeleteOptions, WithTransaction {}
export interface DeleteResult extends _DeleteResult {}
export interface WithTransaction {
  withTransaction?: boolean;
}
class MongoDBRequester {
  private db: Db;
  private client: MongoClient;

  async connect() {
    const { MONGO_URI, MONGO_HOST = 'localhost', MONGO_PORT = 27017, MONGO_DATABASE } = process.env;
    this.client = await MongoClient.connect(MONGO_URI || `mongodb://${MONGO_HOST}:${MONGO_PORT}`);
    this.db = this.client.db(MONGO_DATABASE);
  }

  async select<T extends Document>(collectionName: string, filter: Filter<T> = {}, options: FindOptions<T> = {}): Promise<T[]> {
    if (!this.db) await this.connect();
    const collection = this.db.collection(collectionName);

    const result = (await collection
      .find(filter, { ...options, projection: { ...options.projection, _id: 0 } })
      .toArray()) as unknown as T[];

    return result;
  }

  async withTransaction<T>(callback: (session: ClientSession, db: Db) => Promise<T>): Promise<T | null> {
    if (!this.db) await this.connect();
    const session = this.client.startSession();
    try {
      session.startTransaction();
      const result = await callback(session, this.db);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      console.error('Transaction aborted due to an error:', error);
      return null;
    } finally {
      session.endSession();
    }
  }

  private async insertDocument<T>(collection: Collection, data: T, options: _InsertOptions) {
    if (Array.isArray(data)) {
      const result = await collection.insertMany(data, options);
      return result.acknowledged && result.insertedIds ? data : null;
    }

    const result = await collection.insertOne(data as any, options);
    return result.acknowledged && result.insertedId ? data : null;
  }

  async insert<T>(collectionName: string, document: T | T[], options: InsertOptions = {}): Promise<T | null> {
    const { withTransaction, ...insertOptions } = options;

    if (!withTransaction) {
      if (!this.db) await this.connect();
      return (await this.insertDocument<typeof document>(this.db.collection(collectionName), document, insertOptions)) as T;
    }
    return await this.withTransaction(async (session, db) => {
      return (await this.insertDocument<typeof document>(this.db.collection(collectionName), document, {
        ...insertOptions,
        session,
      })) as T;
    });
  }

  async update<T extends Document>(
    collectionName: string,
    filter: Filter<Partial<T>>,
    update: Partial<T>,
    options: UpdateOptions = {},
  ): Promise<T | null> {
    const { withTransaction, ...updateOptions } = options;
    if (!withTransaction) {
      if (!this.db) await this.connect();
      const collection = this.db.collection(collectionName);
      const result = await collection.updateOne(filter, { $set: update }, updateOptions);

      if (result.matchedCount === 0) {
        return null;
      }

      return (await collection.findOne(filter)) as unknown as T;
    }

    return await this.withTransaction(async (session, db) => {
      const collection = db.collection(collectionName);
      const result = await collection.updateOne(filter, { $set: update }, { ...options, session });

      if (result.matchedCount === 0) {
        return null;
      }

      return (await collection.findOne(filter)) as unknown as T;
    });
  }

  async delete<T extends Document>(
    collectionName: string,
    filter: Filter<Partial<T>>,
    options: DeleteOptions = {},
  ): Promise<DeleteResult | null> {
    if (!this.db) await this.connect();
    const collection = this.db.collection(collectionName);
    const result = await collection.deleteOne(filter, options);

    if (result.deletedCount === 0) {
      return null;
    }

    return result;
  }
}

export const mongodb = new MongoDBRequester();
