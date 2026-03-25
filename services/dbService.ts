import { openDB } from 'idb';
import { TraderProfile } from '../types';

const DB_NAME = 'ProTradeDB';
const STORE_NAME = 'profiles';
const SYNC_QUEUE_STORE = 'sync_queue';

// เปิด Database
const dbPromise = openDB(DB_NAME, 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
    if (oldVersion < 2) {
        db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    }
  },
});

export const dbService = {
  async getAllProfiles(): Promise<TraderProfile[]> {
    return (await dbPromise).getAll(STORE_NAME);
  },

  async saveProfile(profile: TraderProfile): Promise<void> {
    await (await dbPromise).put(STORE_NAME, profile);
  },

  async saveAllProfiles(profiles: TraderProfile[]): Promise<void> {
    const tx = (await dbPromise).transaction(STORE_NAME, 'readwrite');
    await Promise.all(profiles.map(p => tx.store.put(p)));
    await tx.done;
  },

  async deleteProfile(id: string): Promise<void> {
    await (await dbPromise).delete(STORE_NAME, id);
  },

  // Sync Queue Methods
  async addToQueue(op: { type: 'save' | 'delete', payload: any }): Promise<void> {
    await (await dbPromise).add(SYNC_QUEUE_STORE, { ...op, timestamp: Date.now() });
  },

  async getQueue(): Promise<any[]> {
    return (await dbPromise).getAll(SYNC_QUEUE_STORE);
  },

  async removeFromQueue(id: number): Promise<void> {
    await (await dbPromise).delete(SYNC_QUEUE_STORE, id);
  }
};
