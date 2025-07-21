import type { Schema, Struct } from '@strapi/strapi';

export interface GlobalAlgoCategoryEntry extends Struct.ComponentSchema {
  collectionName: 'components_global_algo_category_entries';
  info: {
    displayName: 'AlgoCategoryEntry';
    icon: 'archive';
  };
  attributes: {
    category: Schema.Attribute.Relation<'oneToOne', 'api::category.category'>;
    weightage: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 100;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<50>;
  };
}

export interface LocationLocation extends Struct.ComponentSchema {
  collectionName: 'components_location_locations';
  info: {
    displayName: 'Location';
  };
  attributes: {
    address: Schema.Attribute.String;
    latitude: Schema.Attribute.Decimal;
    longitude: Schema.Attribute.Decimal;
    zip: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'global.algo-category-entry': GlobalAlgoCategoryEntry;
      'location.location': LocationLocation;
    }
  }
}
