import type { Metadata } from "next";
import { Anuphan, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-en",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HR Workforce Management System",
  description: "ระบบบริหารจัดการบุคลากรและงาน HR",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${anuphan.className} ${anuphan.variable} ${inter.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}