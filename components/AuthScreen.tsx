import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

interface Props {
  onSuccess: () => void;
}

type AuthMode = 'LOGIN' | 'REGISTER' | 'COUPON';

export const AuthScreen: React.FC<Props> = ({ onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const init = async () => {
      // 1. Get Device ID
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      setDeviceId(result.visitorId);

      // 2. Check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        onSuccess();
      }
    };
    init();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'REGISTER') {
        // Add timeout to prevent hanging
        const signUpPromise = supabase.auth.signUp({ email, password });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 10000));

        const { data, error } = await Promise.race([signUpPromise, timeoutPromise]) as any;

        if (error) throw error;
        
        if (data.user) {
          // Create profile safely - use upsert and don't block on error
          try {
              const { error: profileError } = await supabase.from('user_profiles').upsert([{ 
                  id: data.user.id, 
                  email: data.user.email 
              }], { onConflict: 'id' });
              
              if (profileError) {
                  console.warn("Profile creation warning (non-fatal):", profileError);
              }
          } catch (err) {
              console.warn("Profile creation failed:", err);
          }
          
          // Show success message and wait 5s
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            setMode('LOGIN');
            setEmail('');
            setPassword('');
          }, 5000);
        }
      } else {
        // Add timeout for login as well
        const signInPromise = supabase.auth.signInWithPassword({ email, password });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 10000));

        const { data, error } = await Promise.race([signInPromise, timeoutPromise]) as any;

        if (error) throw error;
        if (data.user) {
          onSuccess();
        }
      }
    } catch (err: any) {
      let msg = err.message || 'An error occurred';
      if (msg.includes('Invalid login credentials')) {
          msg = 'ไม่พบผู้ใช้งานนี้ หรือรหัสผ่านผิด';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('User not authenticated');

      // 1. Check coupon validity
      const { data: coupon, error: couponErr } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.trim())
        .eq('is_active', true)
        .single();

      if (insertUsedError) {
  console.error("Supabase Error แจ้งว่า:", insertUsedError); // บรรทัดนี้จะแฉตัวการที่แท้จริง!
  throw new Error('ขออภัยค่ะ อุปกรณ์นี้เคยรับสิทธิ์ใช้งานฟรีไปแล้ว ❌');
}

      // 2. Check if device already used a coupon
      const { data: used, error: usedErr } = await supabase
        .from('device_used_coupons')
        .select('*')
        .eq('device_id', deviceId)
        .single();

      if (used) {
        if (used.user_id === user.user.id) {
          // Same user, just sync profile
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + 90);
          await supabase.from('user_profiles').update({ trial_ends_at: trialEndsAt.toISOString() }).eq('id', user.user.id);
          onSuccess();
          return;
        }
        throw new Error('เครื่องนี้เคยใช้สิทธิ์คูปองไปแล้วโดยบัญชีอื่น');
      }

      // 3. Update user profile trial
      const trialDays = 90;
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({ trial_ends_at: trialEndsAt.toISOString() })
        .eq('id', user.user.id);

      if (updateErr) throw updateErr;

      // 4. Record device usage
      await supabase
        .from('device_used_coupons')
        .insert([{ device_id: deviceId, coupon_code: couponCode.trim(), user_id: user.user.id }]);

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#09090b] p-4">
         <div className="relative w-full max-w-md glass-bubble border border-green-500/30 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 p-8 text-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-2xl font-black text-white mb-2 uppercase">Registration Successful!</h2>
            <p className="text-zinc-400 text-sm mb-6">Your account has been created.</p>
            <p className="text-blue-400 text-xs font-bold animate-pulse mb-4">Redirecting to login in 5 seconds...</p>
            <button 
                onClick={() => {
                    setShowSuccess(false);
                    setMode('LOGIN');
                    setEmail('');
                    setPassword('');
                }}
                className="text-xs text-zinc-500 hover:text-white underline cursor-pointer"
            >
                Go to Login Now
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#09090b] p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] animate-pulse delay-700"></div>
      </div>

      <div className="relative w-full max-w-md glass-bubble border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">
              PUNPORT <span className="text-blue-500">FX</span>
            </h1>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">ProTrade Replay System</p>
          </div>

          {mode !== 'COUPON' && (
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 mb-6">
              <button
                onClick={() => setMode('LOGIN')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'LOGIN' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                LOGIN
              </button>
              <button
                onClick={() => setMode('REGISTER')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'REGISTER' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                REGISTER
              </button>
            </div>
          )}

          {mode === 'COUPON' ? (
            <form onSubmit={handleCoupon} className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold text-white">กรอกรหัสคูปอง</h2>
                <p className="text-xs text-zinc-400 mt-1">เพื่อเปิดใช้งานระบบเทรด Replay 90 วัน</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="input-bubble w-full rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-colors placeholder-zinc-700"
                  placeholder="ENTER CODE"
                />
              </div>

              {error && <p className="text-xs text-red-400 font-bold text-center animate-shake">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-black py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'VERIFYING...' : 'ACTIVATE SYSTEM'}
              </button>
              
              <p className="text-[10px] text-zinc-600 text-center mt-4 uppercase font-bold tracking-tighter">
                Device ID: {deviceId.slice(0, 8)}...
              </p>

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                className="w-full mt-4 text-[10px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-widest transition-colors"
              >
                Sign Out / Change Account
              </button>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-bubble w-full rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-colors placeholder-zinc-700"
                  placeholder="your@email.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-bubble w-full rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-colors placeholder-zinc-700"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-xs text-red-400 font-bold text-center">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-black py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? 'PROCESSING...' : mode === 'LOGIN' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
