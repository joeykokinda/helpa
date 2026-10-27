import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Helpa",
  description: "Your friendly little house helper for fixing things at home.",
  applicationName: "Helpa",
  appleWebApp: { capable: true, title: "Helpa", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafafa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={figtree.variable} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Apply a saved dark-mode choice before first paint so the page never flashes. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("helpa-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
