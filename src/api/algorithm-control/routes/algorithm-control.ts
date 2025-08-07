/**
 * algorithm-control router
 */

export default {
  routes: [
    {
      method: "PUT",
      path: "/algorithm-control",
      handler: "algorithm-control.update",
    },
    {
      method: "GET",
      path: "/algorithm-control",
      handler: "algorithm-control.find",
    },
  ],
};
