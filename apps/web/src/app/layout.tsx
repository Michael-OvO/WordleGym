import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WordleGym",
  description: "Strategy analysis and interactive play for standard, evil, and hidden-mode Wordle.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="app-frame">
          <header className="site-header">
            <Link className="brand" href="/">
              WordleGym
            </Link>
            <nav className="site-nav">
              <Link href="/docs">Research</Link>
              <Link href="/results">Results</Link>
              <Link href="/play/standard">Standard</Link>
              <Link href="/play/evil">Evil</Link>
              <Link href="/play/unknown">Unknown</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
