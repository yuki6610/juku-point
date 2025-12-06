import "./globals.css";
import ReturnToMypageButton from "../components/ReturnToMypageButton";

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
        <meta name="theme-color" content="#2e7d32" />
      </head>
      <body>
        <div className="app-container">{children}</div>
        <ReturnToMypageButton />
      </body>
    </html>
  );
}
