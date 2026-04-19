import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ruhtusfckrsqflgymawe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1aHR1c2Zja3JzcWZsZ3ltYXdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwMDQ1MiwiZXhwIjoyMDgzOTc2NDUyfQ.tihc2r64M3Mt1EHZ63venpC6BecYB8CP1vZKTd96yfg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { count, error } = await supabase
    .from('market_data')
    .select('*', { count: 'exact', head: true });
    
  if (error) console.error(error);
  console.log('Total rows in market_data:', count);
  
  // Get unique symbols
  const { data: symbols } = await supabase
    .from('market_data')
    .select('symbol')
    .limit(1000);
    
  const uniqueSymbols = [...new Set(symbols?.map(s => s.symbol))];
  console.log('Symbols found in sample:', uniqueSymbols);
}

check();
