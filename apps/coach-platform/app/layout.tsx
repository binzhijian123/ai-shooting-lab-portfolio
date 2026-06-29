import "./globals.css";

export const metadata = {
  title: "Arc Lab Coach OS",
  description: "Coach-led basketball shooting review platform scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
