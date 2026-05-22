import "./globals.css";

export const metadata = {
  title: "Insta-ntiate",
  description: "Search and revisit saved Instagram posts collected from your own browser session."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
