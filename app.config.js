// Only the Pages build uses a subpath; local Expo and native builds keep their existing config.
module.exports = ({ config }) => {
  const baseUrl = (process.env.EXPO_BASE_PATH || '').replace(/\/$/, '');
  if (!baseUrl) return config;
  if (!/^\/[A-Za-z0-9._-]+$/.test(baseUrl)) throw new Error('EXPO_BASE_PATH must be one repository path, for example /Kelly');
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
