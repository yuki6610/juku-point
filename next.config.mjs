/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async redirects() {
    return [
      ['/admin/shifts', '/admin/shift-management?tab=week'],
      ['/admin/teacher-preferences', '/admin/shift-management?tab=preferences'],
      ['/admin/students', '/admin/student-management?tab=list'],
      ['/admin/student-notes', '/admin/student-management?tab=notes'],
      ['/admin/tags', '/admin/student-management?tab=tags'],
      ['/admin/mock-scores', '/admin/academics?tab=mock'],
      ['/admin/schools', '/admin/academics?tab=schools'],
      ['/admin/point-history', '/admin/points?tab=history'],
      ['/admin/referrals', '/admin/family?tab=referrals'],
      ['/admin/student-accounts', '/admin/accounts?tab=students'],
      ['/admin/account-recovery', '/admin/accounts?tab=recovery'],
      ['/admin/parents', '/admin/accounts?tab=parents'],
      ['/admin/feedback', '/admin/operations?tab=feedback'],
      ['/admin/operations-costs', '/admin/operations?tab=costs'],
      ['/admin/lesson-attendance', '/admin/lesson-records?tab=attendance'],
    ].map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;
