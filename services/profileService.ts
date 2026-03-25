
import { supabase } from './supabase';
import { TraderProfile } from '../types';
import { dbService } from './dbService';
import { syncManager } from './syncManager';

// Helper: Truncate data for cloud storage to save space
const truncateProfileForCloud = (profile: TraderProfile) => ({
    ...profile,
    account: {
        ...profile.account,
        history: profile.account.history.slice(-20)
    },
    drawings: profile.drawings.slice(-5)
});

export const fetchUserSessions = async (userId: string): Promise<TraderProfile[]> => {
    // 1. Try fetching from IndexedDB first (Local-First)
    const localProfiles = await dbService.getAllProfiles();
    if (localProfiles.length > 0) {
        return localProfiles;
    }

    // 2. If empty, fetch from Supabase
    const { data, error } = await supabase
        .from('trader_profiles')
        .select('data')
        .eq('user_id', userId);

    if (error) {
        console.warn('Could not fetch from trader_profiles table.', error.message);
        return [];
    }

    if (data && data.length > 0) {
        const profiles = data.map(row => row.data as TraderProfile);
        // Populate IndexedDB
        await dbService.saveAllProfiles(profiles);
        return profiles;
    }

    return [];
};

export const saveAllUserSessions = async (profiles: TraderProfile[]) => {
    // 1. Save FULL data to IndexedDB immediately
    await dbService.saveAllProfiles(profiles);

    // 2. Add to sync queue
    for (const profile of profiles) {
        await dbService.addToQueue({ type: 'save', payload: profile });
    }
    
    // 3. Trigger sync
    syncManager.processQueue();
};

export const saveUserSession = async (userId: string, profile: TraderProfile) => {
    // 1. Save FULL data to IndexedDB immediately
    await dbService.saveProfile(profile);

    // 2. Add to sync queue
    await dbService.addToQueue({ type: 'save', payload: profile });
    
    // 3. Trigger sync
    syncManager.processQueue();
};

export const deleteUserSession = async (profileId: string) => {
    // 1. Delete from IndexedDB immediately
    await dbService.deleteProfile(profileId);

    // 2. Add delete op to sync queue
    await dbService.addToQueue({ type: 'delete', payload: profileId });
    
    // 3. Trigger sync
    syncManager.processQueue();
};
