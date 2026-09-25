import "./globals.css";
import "./customer-experience.css";
import StudentNavigation from "../components/StudentNavigation";
import PwaRegistration from "../components/PwaRegistration";
import { AppDialogProvider } from "../components/AppDialogProvider";

export const metadata = {
  title: "千鳥が丘 学習アプリ",
  description: "千鳥が丘学習塾の学習アプリ",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "千鳥が丘 学習アプリ", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
        />
        <meta name="theme-color" content="#5b64d8" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {process.env.NEXT_PUBLIC_DEMO_MODE === "1" && <div className="local-demo-banner">ローカルデモ · 架空データのみ · 本番とは接続していません</div>}
        <AppDialogProvider>
          <div className="app-container">{children}</div>
          <StudentNavigation />
          <PwaRegistration />
        </AppDialogProvider>
      </body>
    </html>
  );
}
