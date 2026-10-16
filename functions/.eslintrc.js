module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended",
    // "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "off",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    "max-len": ["error", { code: 500 }],
    "object-curly-spacing": "off",
    "comma-dangle": "off",
    "padded-blocks": "off",
    "indent": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
