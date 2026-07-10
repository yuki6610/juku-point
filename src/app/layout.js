import "./globals.css";
import StudentNavigation from "../components/StudentNavigation";

export const metadata = {
  title: "塾ポイントアプリ",
  description: "学習塾のポイント＆景品管理アプリ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167x167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152x152.png" />
        <meta name="theme-color" content="#2e7d32" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ちどポ！" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <div className="app-container">{children}</div>
        <StudentNavigation />
      </body>
    </html>
  );
}
