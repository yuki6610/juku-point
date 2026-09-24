import "./globals.css";
import "./customer-experience.css";
import StudentNavigation from "../components/StudentNavigation";
import PwaRegistration from "../components/PwaRegistration";
import { AppDialogProvider } from "../components/AppDialogProvider";

export const metadata = {
  title: "千鳥が丘 学習アプリ",
  description: "千鳥が丘学習塾の学習アプリ",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
        />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167x167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152x152.png" />
        <meta name="theme-color" content="#5b64d8" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="千鳥が丘 学習アプリ" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
