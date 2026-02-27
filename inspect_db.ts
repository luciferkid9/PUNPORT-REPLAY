
import { supabase } from './services/supabase';

async function inspectDB() {
    console.log("Inspecting user_profiles...");
    const { data, error } = await supabase.from('user_profiles').select('*').limit(1);
    if (error) {
        console.error("Error selecting user_profiles:", error);
    } else {
        console.log("user_profiles columns:", data && data.length > 0 ? Object.keys(data[0]) : "No data or empty");
    }

    console.log("Inspecting trading_sessions...");
    const { data: sessions, error: sessionError } = await supabase.from('trading_sessions').select('*').limit(1);
    if (sessionError) {
        console.error("Error selecting trading_sessions (likely doesn't exist):", sessionError);
    } else {
        console.log("trading_sessions exists:", sessions);
    }
}

inspectDB();
