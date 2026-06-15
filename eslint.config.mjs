import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  // Global ignores. The extension is a standalone browser bundle (uses the
  // `chrome.*` globals) and downloads/ + public/downloads/ are generated
  // distribution copies, so they are outside the Next app lint scope.
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "data/**",
      "extension/**",
      "downloads/**",
      "public/**",
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
