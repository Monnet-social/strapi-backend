const controllers = require("./controllers");
const routes = require("./routes");

module.exports = (plugin) => {
  for (let key in controllers) {
    plugin.controllers[key] = {
      ...plugin.controllers[key],
      ...controllers[key],
    };
  }

  plugin.routes["content-api"].routes = [
    ...routes,
    ...plugin.routes["content-api"].routes,
  ];

  return plugin;
};
