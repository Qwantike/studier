/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: { extend: {
    fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    keyframes: { "slide-in": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } } },
    animation: { "slide-in": "slide-in 0.18s ease-out" },
  } },
};
