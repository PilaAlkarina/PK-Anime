/**
 * Webpack plugin for production client builds: once the chunks are minified, rewrites each one
 * to ES2017 with Next's own SWC, so older Smart TV browsers can parse them (Samsung Tizen 5
 * browses with Chromium 63).
 *
 * browserslist only reaches our own code. Libraries in node_modules (framer-motion, better-auth,
 * tailwind-merge…) and Next's prebuilt client ship `?.` (Chrome 80) and `catch {}` (Chrome 66),
 * and a chunk the browser can't parse is dropped whole, so the app never starts. Downleveling
 * the final output covers all of them at once.
 */
const { transform } = require("next/dist/build/swc");

const NAME = "LegacyDownlevel";

class LegacyDownlevelPlugin {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap(NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        // After minification, so it sees exactly what ships
        { name: NAME, stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER },
        async (assets) => {
          const names = Object.keys(assets).filter((name) => name.endsWith(".js"));
          await Promise.all(
            names.map(async (name) => {
              const source = assets[name].source().toString();
              const { code } = await transform(source, {
                jsc: {
                  target: "es2017",
                  parser: { syntax: "ecmascript" },
                  // Keep it compact without minifying a second time
                  minify: { compress: false, mangle: false },
                },
                minify: true,
                sourceMaps: false,
                isModule: false,
              });
              compilation.updateAsset(name, new sources.RawSource(code));
            })
          );
        }
      );
    });
  }
}

module.exports = { LegacyDownlevelPlugin };
