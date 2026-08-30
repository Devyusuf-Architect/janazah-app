module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reanimated: false }]],
    // Reanimated 4 moves the worklets transform into its own plugin, and it
    // must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
