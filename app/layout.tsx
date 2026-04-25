import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Planner",
  description: "A simple daily schedule planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  );
}
