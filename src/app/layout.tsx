import type { Metadata } from "next";
import { Providers } from "@/components/providers/session-provider";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniFlow - Convert Social Engagement Into Instant Automated Sales",
  description:
    "Unified Creator OS combining a digital bio-link store with Instagram and Facebook comment-to-inbox Auto-DM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
      </head>
      <body className="min-h-screen bg-dark-950 bg-grid-pattern font-sans text-slate-100 antialiased selection:bg-brand-500 selection:text-white">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
