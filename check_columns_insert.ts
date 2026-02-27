
import { supabase } from './services/supabase';

async function checkInsert() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.log("No user logged in. Please log in first.");
        // Try to sign in with a test user?
        // Or just rely on the existing user if any.
        // Actually, I can't easily sign in here without credentials.
        // I'll assume I can use a dummy ID if RLS allows insert.
        // But usually RLS requires auth.
        // I'll try to sign up a temp user.
        const email = `test_${Date.now()}@example.com`;
        const password = 'password123';
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) {
            console.error("SignUp error:", authError);
            return;
        }
        const userId = authData.user?.id;
        if (!userId) {
            console.error("No user ID returned");
            return;
        }
        console.log("Created test user:", userId);

        // Try to insert into user_profiles with potential columns
        const potentialColumns = ['metadata', 'settings', 'preferences', 'data', 'profile_data', 'full_name', 'avatar_url'];
        
        for (const col of potentialColumns) {
            console.log(`Trying column: ${col}`);
            const payload: any = { id: userId };
            payload[col] = { test: 'value' }; // Try JSONB/JSON
            if (col === 'full_name' || col === 'avatar_url') payload[col] = 'test_string';

            const { error } = await supabase.from('user_profiles').upsert(payload);
            if (error) {
                console.log(`Column ${col} failed:`, error.message);
            } else {
                console.log(`Column ${col} SUCCESS!`);
            }
        }
    }
}

checkInsert();
