/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    // Old Smart TV browsers: legacy color syntax and inset fallbacks (see the file)
    "./postcss-legacy.cjs": {},
    autoprefixer: {},
  },
};

export default config;
