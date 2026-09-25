export const metadata = {
  title: '保護者ページ',
  manifest: '/manifest-parent.json',
  appleWebApp: { capable: true, title: '保護者ページ', statusBarStyle: 'default' },
  icons: { apple: '/icons/parent-apple-touch-icon.png?v=20260925' },
};

export default function ParentLayout({children}){return children;}
