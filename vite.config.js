// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import browserslistToEsbuild from "browserslist-to-esbuild";
import banner from "vite-plugin-banner";

export default defineConfig({
  plugins: [
    cssInjectedByJsPlugin(),
    banner({
      content: `
/*!
 * 
 *  ////////////////////////////////////////////////////
 *  //                                                //
 *  //                                                //
 *  //         d8888           d8b 888                //
 *  //        d8P888           Y8P 888                //
 *  //       d8P 888               888                //
 *  //      d8P  888  .d8888b  888 888888 .d88b.      //
 *  //     d88   888  88K      888 888   d8P  Y8b     //
 *  //     8888888888 "Y8888b. 888 888   88888888     //
 *  //           888       X88 888 Y88b. Y8b.         //
 *  //           888   88888P' 888  "Y888 "Y8888      //
 *  //                                                //
 *  //                                                //
 *  ////////////////////////////////////////////////////
 *  //                                                //
 *  //            Engaging Networks Regive            //
 *  //                                                //
 *  //            Fernando Santos [<(🔵)>]            //
 *  //          fernando[at]4sitestudios.com          //
 *  //                                                //
 *  //        Build Date:  ${new Date().toLocaleDateString("en-US", {
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
 })} ${new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}        //
 *  //                                                //
 *  //            Created by 4Site Studios            //
 *  //     www.4sitestudios.com/engaging-networks     //
 *  //                                                //
 *  ////////////////////////////////////////////////////
 *
 */`,
    }),
  ],
  build: {
    target: browserslistToEsbuild([">1%", "not dead"]),
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "src/main.ts"),
      name: "EngagingNetworksRegive",
      // the proper extensions will be added
      fileName: "regive",
      formats: ["es"],
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [],
      output: {
        manualChunks: undefined,
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {},
      },
    },
  },
});
