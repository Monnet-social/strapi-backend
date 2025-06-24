export default {
  routes: [
    {
      method: "GET",
      path: "/categories",
      handler: "category.getCategories",
      config: {
        prefix: "",
      },
    },
  ],
};
