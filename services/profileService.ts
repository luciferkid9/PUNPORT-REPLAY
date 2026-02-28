
import { supabase } from './supabase';
import { TraderProfile } from '../types';

export const fetchUserSessions = async (userId: string): Promise<TraderProfile[]> => {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        console.error('Error fetching user for sessions:', error);
        return [];
    }

    return (user.user_metadata?.sessions as TraderProfile[]) || [];
};

export const saveAllUserSessions = async (profiles: TraderProfile[]) => {
    try {
        // Create lightweight versions for Cloud Storage
        const cloudProfiles = profiles.map(profile => ({
            ...profile,
            // Limit history to last 20 trades to save space
            account: {
                ...profile.account,
                history: profile.account.history.slice(-20)
            },
            // Limit drawings to last 5 to save space
            drawings: profile.drawings.slice(-5)
        }));

        // Check estimated size
        const payloadSize = JSON.stringify(cloudProfiles).length;
        if (payloadSize > 3500) {
            console.warn("Warning: Bulk session data is large (" + payloadSize + " bytes). Truncating history further.");
            // If still too large, truncate history to 5
            cloudProfiles.forEach(p => {
                p.account.history = p.account.history.slice(-5);
                p.drawings = [];
            });
        }

        const { error } = await supabase.auth.updateUser({
            data: { sessions: cloudProfiles }
        });

        if (error) {
            console.error('Error saving all sessions to user_metadata:', error);
        } else {
            // console.log('All sessions saved to cloud successfully');
        }
    } catch (e) {
        console.error('Exception saving all sessions:', e);
    }
};

export const saveUserSession = async (userId: string, profile: TraderProfile) => {
    try {
        const currentSessions = await fetchUserSessions(userId);
        
        // Create a lightweight version for Cloud Storage (Metadata limit is small ~4KB-8KB)
        // We prioritize Account Balance, Equity, and recent history.
        const cloudProfile: TraderProfile = {
            ...profile,
            // Limit history to last 20 trades to save space
            account: {
                ...profile.account,
                history: profile.account.history.slice(-20)
            },
            // Limit drawings to last 5 to save space
            drawings: profile.drawings.slice(-5)
        };
        
        const existingIndex = currentSessions.findIndex(p => p.id === profile.id);
        let updatedSessions;

        if (existingIndex >= 0) {
            updatedSessions = [...currentSessions];
            updatedSessions[existingIndex] = cloudProfile;
        } else {
            updatedSessions = [...currentSessions, cloudProfile];
        }

        // Check estimated size
        const payloadSize = JSON.stringify(updatedSessions).length;
        if (payloadSize > 3500) {
             // If too large, truncate history further for ALL sessions in the payload
             updatedSessions.forEach(p => {
                p.account.history = p.account.history.slice(-5);
                p.drawings = [];
            });
            console.warn("Warning: Session data truncated further due to size limit.");
        }

        const { error } = await supabase.auth.updateUser({
            data: { sessions: updatedSessions }
        });

        if (error) {
            console.error('Error saving session to user_metadata:', error);
        } else {
            // console.log('Session saved to cloud successfully');
        }
    } catch (e) {
        console.error('Exception saving session:', e);
    }
};

export const deleteUserSession = async (profileId: string) => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const currentSessions = (user.user_metadata?.sessions as TraderProfile[]) || [];
        const updatedSessions = currentSessions.filter(p => p.id !== profileId);

        const { error } = await supabase.auth.updateUser({
            data: { sessions: updatedSessions }
        });

        if (error) {
            console.error('Error deleting session from user_metadata:', error);
        }
    } catch (e) {
        console.error('Exception deleting session:', e);
    }
};
