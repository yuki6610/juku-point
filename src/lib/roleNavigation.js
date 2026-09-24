const LAST_ROLE_KEY = 'juku-point:lastRole';

export function rememberRole(role) {
  if (typeof window === 'undefined' || !['student', 'teacher', 'parent', 'admin'].includes(role)) return;
  try { window.localStorage.setItem(LAST_ROLE_KEY, role); } catch {}
}

export function loginPathForLastRole() {
  if (typeof window === 'undefined') return '/login';
  try {
    const role = window.localStorage.getItem(LAST_ROLE_KEY);
    if (role === 'teacher') return '/teacher/login';
    if (role === 'parent') return '/parent/login';
  } catch {}
  return '/login';
}
