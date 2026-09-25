export const metadata = {
  title: '講師ページ',
  manifest: '/manifest-teacher.json',
  appleWebApp: { capable: true, title: '講師ページ', statusBarStyle: 'default' },
  icons: { apple: '/icons/teacher-apple-touch-icon.png?v=20260925' },
};

export default function TeacherLayout({children}){return children;}
