'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebaseConfig';

export function useAcademicContext() {
  const [context, setContext] = useState({ current: null, settings: [], loading: true, error: '' });
  useEffect(() => {
    let revision = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const requestId = ++revision;
      try {
        if (!user) throw new Error('ログインしてください。');
        const response = await fetch('/api/admin/academic-context', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (requestId === revision) setContext({ ...result, loading: false });
      } catch (error) {
        if (requestId === revision) setContext({ current: null, settings: [], loading: false, error: error.message });
      }
    });
    return () => { revision++; unsubscribe(); };
  }, []);
  return context;
}
