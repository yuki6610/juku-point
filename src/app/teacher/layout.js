export const metadata = {
  title: '講師アプリ | 千鳥が丘学習塾',
  manifest: '/manifest-teacher.json',
  appleWebApp: { capable: true, title: 'ちどポ講師', statusBarStyle: 'default' },
  icons: { apple: '/icons/teacher-apple-touch-icon.png' },
};

export default function TeacherLayout({children}){return children;}
