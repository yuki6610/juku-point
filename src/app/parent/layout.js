export const metadata = {
  title: '保護者アプリ | 千鳥が丘学習塾',
  manifest: '/manifest-parent.json',
  appleWebApp: { capable: true, title: 'ちどポ保護者', statusBarStyle: 'default' },
  icons: { apple: '/icons/parent-apple-touch-icon.png' },
};

export default function ParentLayout({children}){return children;}
