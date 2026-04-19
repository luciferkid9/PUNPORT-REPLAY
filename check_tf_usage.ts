import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ruhtusfckrsqflgymawe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1aHR1c2Zja3JzcWZsZ3ltYXdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwMDQ1MiwiZXhwIjoyMDgzOTc2NDUyfQ.tihc2r64M3Mt1EHZ63venpC6BecYB8CP1vZKTd96yfg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTFUsage() {
    // Check how many rows exist for M2 vs other TFs
    const { count: m2Count } = await supabase
        .from('market_data')
        .select('*', { count: 'exact', head: true })
        .eq('tf', 'M2');
        
    const { count: totalCount } = await supabase
        .from('market_data')
        .select('*', { count: 'exact', head: true });
        
    console.log(`Total Rows: ${totalCount}`);
    console.log(`M2 Rows: ${m2Count}`);
    
    if (totalCount && m2Count) {
        const percentage = (m2Count / totalCount) * 100;
        console.log(`M2 is ${percentage.toFixed(2)}% of total rows`);
        const estimatedMB = (m2Count / totalCount) * 1308;
        console.log(`M2 is consuming roughly ${estimatedMB.toFixed(2)} MB of your 1308 MB`);
    }
}

checkTFUsage();
