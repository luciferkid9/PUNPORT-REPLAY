
import { supabase } from './services/supabase';

async function checkColumns() {
    const { data, error } = await supabase.from('device_used_coupons').select('*').limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Data:", data);
        if (data && data.length > 0) {
            console.log("Columns:", Object.keys(data[0]));
        } else {
            console.log("No data, trying to insert a dummy record to see schema error");
            const { error: insertError } = await supabase.from('device_used_coupons').insert({
                device_id: 'dummy',
                coupon_code: 'dummy',
                user_id: 'dummy',
                ip: '1.1.1.1'
            });
            console.log("Insert with ip error:", insertError);
        }
    }
}

checkColumns();
