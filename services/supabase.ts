import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ruhtusfckrsqflgymawe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1aHR1c2Zja3JzcWZsZ3ltYXdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDA0NTIsImV4cCI6MjA4Mzk3NjQ1Mn0.nCYhQBqrYuE5pctHo-xtnPrWlfzS1YXiqMH5FzR6x0I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
