import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OmniFlow - Convert Social Engagement Into Instant Automated Sales",
  description:
    "Unified Creator OS combining a digital bio-link store with Instagram and Facebook comment-to-inbox Auto-DM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark scroll-smooth ${sans.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
      </head>
      <body className={`${sans.className} min-h-screen bg-dark-950 bg-grid-pattern font-sans text-slate-100 antialiased selection:bg-brand-500 selection:text-white`}>
        {children}
      </body>
    </html>
  );
}
