import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheFold",
  description: "Autonomous development agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no" data-theme="dark" suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-sans)" }}>
        {children}
      </body>
    </html>
  );
}
