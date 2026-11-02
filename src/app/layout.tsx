import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ClientLog } from "@/components/client-log";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

/* One typeface with tabular figures; the mono stack for Diagnostics comes from the system. */
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Recomp", template: "%s · Recomp" },
  applicationName: "Recomp",
  description: "Personal body-recomposition tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Recomp" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1013" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-dvh bg-bg font-sans text-fg">
        {children}
        <SwRegister />
        <ClientLog />
      </body>
    </html>
  );
}
