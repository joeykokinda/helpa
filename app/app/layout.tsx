import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  // Share cards need absolute URLs; set SITE_URL to the public address when deploying.
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Helpa",
  description: "Fix anything in your home, even if you know nothing. Snap what's broken and Helpa shows every move on a 3D model of your machine, then on the machine itself.",
  openGraph: { title: "Helpa: fix anything in your home", description: "Snap what's broken. Helpa finds your exact machine, shows every move in 3D and on your camera, checks your work, and handles the part or the pro.", siteName: "Helpa" },
  twitter: { card: "summary_large_image", title: "Helpa: fix anything in your home" },
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
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sans.variable} data-theme="light" suppressHydrationWarning>
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
