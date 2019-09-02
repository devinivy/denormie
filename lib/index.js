'use strict';

const { schema: { Entity, Array: ArraySchema }, ...Normalizr  } = require('normalizr');

const internals = {};

exports.args = (parentSchema, entities, paths) => {

    entities = { ...entities };

    const { clone, startsWith, wrapUnvisit } = internals;

    const walkSchema = (schema, path = []) => {

        schema = Array.isArray(schema) ? new ArraySchema(schema[0]) : clone(schema);

        if (schema instanceof ArraySchema) {
            schema.schema = walkSchema(schema.schema, path);
            const { denormalizeValue } = schema;
            schema.denormalizeValue = (input, unvisit) => {

                return denormalizeValue.call(schema, input, wrapUnvisit(unvisit));
            };
        }
        else {
            schema.schema = clone(schema.schema);
            Object.entries(schema.schema).forEach(([relation, subschema]) => {

                const nextPath = [...path, relation];

                if (paths.some((p) => startsWith(p, nextPath))) {
                    schema.schema[relation] = walkSchema(subschema, nextPath);
                }
                else {
                    delete schema.schema[relation];
                }
            });

            if (path.length) {
                schema.relationKey = `${schema.key}:${path.join('.')}`;
                entities[schema.relationKey] = entities[schema.key];
            }

            const { denormalize } = schema;
            schema.denormalize = (input, unvisit) => {

                return denormalize.call(schema, input, wrapUnvisit(unvisit));
            };
        }

        return schema;
    };

    return [walkSchema(parentSchema), entities];
};

exports.denormalize = (result, schema, entities, paths) => Normalizr.denormalize(result, ...exports.args(schema, entities, paths));

internals.clone = (obj) => Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);

internals.startsWith = (arr1, arr2) => arr2.every((val, i) => arr1[i] === val);

internals.wrapUnvisit = (unvisit) => {

    return (id, schema) => {

        if (schema.relationKey) {
            const nextSchema = new Entity(schema.relationKey);
            nextSchema.schema = schema.schema;
            return unvisit(id, nextSchema);
        }

        return unvisit(id, schema);
    };
};
