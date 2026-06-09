import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codeforces Group Rankings",
  description: "Combined Tour 1 and Tour 2 qualification rankings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
