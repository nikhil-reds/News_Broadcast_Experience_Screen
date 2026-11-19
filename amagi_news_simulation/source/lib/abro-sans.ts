import localFont from "next/font/local";

export const abroSans = localFont({
  src: [
    { path: "../public/fonts/AbroSans/OpenType-TT/AbroSans-Thin.ttf", weight: "100" },
    { path: "../public/fonts/AbroSans/OpenType-TT/AbroSans-Regular.ttf", weight: "400" },
    { path: "../public/fonts/AbroSans/OpenType-TT/AbroSans-Bold.ttf", weight: "700" },
  ], variable: "--font-abro-sans", display: "swap",
});
