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
              <a
                className="site-nav-github"
                href="https://github.com/Michael-OvO/WordleGym"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View WordleGym on GitHub"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.17a11.04 11.04 0 0 1 5.8 0c2.2-1.48 3.17-1.17 3.17-1.17.63 1.6.23 2.78.11 3.07.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.4-5.26 5.68.42.36.79 1.08.79 2.18 0 1.57-.01 2.83-.01 3.22 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
                </svg>
                GitHub
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
