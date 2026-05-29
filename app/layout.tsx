import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reserve Radar — mida tohib sellel maal teha?",
  description:
    "Sisesta katastritunnus või aadress ja näe koheselt, millised piirangud kinnistule kehtivad.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="et">
      <body>{children}</body>
    </html>
  );
}
