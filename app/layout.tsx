import "./globals.css";

export const metadata = {
  title: "Conference Headshot Booth Cost Calculator",
  description: "Estimate budget, recommended stations, and capacity for your event headshot booth."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}