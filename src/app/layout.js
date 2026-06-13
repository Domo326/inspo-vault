import './globals.css';

export const metadata = {
  title:       'InspoVault',
  description: 'Your personal inspiration HQ — save links, screenshots, and AI prompts from anywhere',
  manifest:    '/manifest.json',
  themeColor:  '#E67A2E',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'InspoVault' },
  viewport:    { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E67A2E" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="InspoVault" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(console.error);
              });
            }
          `,
        }} />
      </body>
    </html>
  );
}
