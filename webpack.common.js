const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: { main: "./src/index.js" },
  module: {
    rules: [
      { test: /\.html$/, use: ["html-loader"] },
      { test: /\.(scss|css)$/, use: ["style-loader", "css-loader", "sass-loader"] },
      { test: /\.(png|jpg|gif|svg)$/, type: "asset/resource" },
      { test: /\.(woff(2)?|ttf|eot)$/, type: "asset/resource", generator: { filename: "fonts/[name][ext]" } },
      { test: /\.(ogg|mp3|wav)$/, type: "asset/resource", generator: { filename: "assets/sounds/[name][ext]" } },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/template.html",
      favicon: "./src/assets/favicon.ico",
    }),
  ],
};