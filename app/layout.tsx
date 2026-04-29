import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Word Master',
  description: 'AI-powered vocabulary learning app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans font-light antialiased tracking-wide selection:bg-blue-100">
        {children}
      </body>
    </html>
  );
}
