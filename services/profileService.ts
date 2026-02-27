
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

export const saveUserSession = async (userId: string, profile: TraderProfile) => {
    try {
        const currentSessions = await fetchUserSessions(userId);
        
        const existingIndex = currentSessions.findIndex(p => p.id === profile.id);
        let updatedSessions;

        if (existingIndex >= 0) {
            updatedSessions = [...currentSessions];
            updatedSessions[existingIndex] = profile;
        } else {
            updatedSessions = [...currentSessions, profile];
        }

        const { error } = await supabase.auth.updateUser({
            data: { sessions: updatedSessions }
        });

        if (error) {
            console.error('Error saving session to user_metadata:', error);
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
