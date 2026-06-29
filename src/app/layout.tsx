import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BotView — SEO Bot Visibility Checker',
  description: 'Analyze what simulated search crawlers can see in raw and JavaScript-rendered HTML.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
