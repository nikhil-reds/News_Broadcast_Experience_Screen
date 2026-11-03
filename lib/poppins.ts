import localFont from "next/font/local";

export const poppins = localFont({
  src: [
    { path: "../public/fonts/Poppins/Poppins-Regular.ttf", weight: "400" },
    { path: "../public/fonts/Poppins/Poppins-SemiBold.ttf", weight: "600" },
  ],
  display: "swap",
});
