import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheFold",
  description: "Autonomous development agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="no" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
