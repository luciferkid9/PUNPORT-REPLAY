
import { supabase } from './services/supabase';

async function checkStorage() {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
        console.error("Error listing buckets:", error);
    } else {
        console.log("Buckets:", data);
    }
}

checkStorage();
