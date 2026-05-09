import type { Metadata } from "next";
import { AttributionFooter } from "@/components/AttributionFooter";
import { MoneyMarquee } from "@/components/MoneyMarquee";
import { NavBar } from "@/components/NavBar";
import { Wordmark } from "@/components/Wordmark";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Texas Money Investigator",
  description:
    "An agent that answers money-in-politics questions about Texas state and local government, sourced to public records from the Texas Ethics Commission and the City of Austin.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Wordmark right={<NavBar />} />
        <MoneyMarquee />
        <div className="flex-1 flex flex-col">{children}</div>
        <AttributionFooter />
      </body>
    </html>
  );
}
