import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Header } from '@/components/layout/header';

export const metadata: Metadata = {
  title: 'CodeRev — AI Code Review Platform',
  description: 'Automated AI-powered pull request review platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="flex flex-col">{children}</main>
      </body>
    </html>
  );
}
