import { supabase } from './supabase';
import { dbService } from './dbService';
import { TraderProfile } from '../types';

// Helper: Truncate data for cloud storage to save space
const truncateProfileForCloud = (profile: TraderProfile) => ({
    ...profile,
    account: {
        ...profile.account,
        history: profile.account.history // เก็บครบทุกออเดอร์ 100% ไม่มีลิมิต
    },
    drawings: profile.drawings // เก็บครบทุกการวาด 100% ไม่มีลิมิต
});

export const syncManager = {
    async processQueue() {
        const queue = await dbService.getQueue();
        if (queue.length === 0) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const userId = session.user.id;

        for (const op of queue) {
            try {
                if (op.type === 'save') {
                    const profile = op.payload as TraderProfile;
                    const profileData = {
                        id: profile.id,
                        user_id: userId,
                        name: profile.name,
                        last_played: profile.lastPlayed || Date.now(),
                        data: truncateProfileForCloud(profile)
                    };

                    const { error } = await supabase
                        .from('trader_profiles')
                        .upsert(profileData, { onConflict: 'id' });
                    
                    if (error) throw error;
                } else if (op.type === 'delete') {
                    const profileId = op.payload as string;
                    const { error } = await supabase
                        .from('trader_profiles')
                        .delete()
                        .eq('id', profileId)
                        .eq('user_id', userId);
                        
                    if (error) throw error;
                }
                
                // Success: remove from queue
                await dbService.removeFromQueue(op.id);
            } catch (e) {
                console.error(`Sync failed for op ${op.id}:`, e);
                // Keep in queue for retry
            }
        }
    }
};
