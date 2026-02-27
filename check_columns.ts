
import { supabase } from './services/supabase';

async function checkColumns() {
    console.log("Checking user_profiles columns...");
    // Try to select specific columns that might exist
    const { data, error } = await supabase.from('user_profiles').select('id, email, trial_ends_at, metadata, preferences, settings').limit(1);
    
    if (error) {
        console.error("Error selecting columns:", error.message);
    } else {
        console.log("Columns found:", data && data.length > 0 ? Object.keys(data[0]) : "No data to infer columns from");
    }
}

checkColumns();
