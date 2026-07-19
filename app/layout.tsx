import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "TradeReviewerPro — Learn from every trade",
  description: "Private, timing-aware portfolio analysis and trade review. Your data stays in your browser.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "TradeReviewerPro",
    description: "Know what your trades are teaching you.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TradeReviewerPro — Know what your trades are teaching you." }],
  },
  twitter: { card: "summary_large_image", title: "TradeReviewerPro", description: "Know what your trades are teaching you.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
