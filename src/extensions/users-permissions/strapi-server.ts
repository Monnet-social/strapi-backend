const controllers = require("./controllers");
const routes = require("./routes");

module.exports = (plugin) => {
  Object.entries(controllers).forEach(([key, controller]) => {
    plugin.controllers[key] = {
      ...plugin.controllers[key],
      ...(controller as any),
    };
  });

  plugin.routes["content-api"].routes.unshift(...routes);
  return plugin;
};
