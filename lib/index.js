'use strict';

const { schema: { Entity, Array: ArraySchema }, ...Normalizr  } = require('normalizr');

const internals = {};

exports.args = (parentSchema, entities, paths) => {

    entities = { ...entities };

    const { clone, startsWith, wrapUnvisit } = internals;

    const walkSchema = (schema, path = []) => {

        schema = Array.isArray(schema) ? new ArraySchema(schema[0]) : clone(schema);

        if (schema instanceof ArraySchema) {

            if (schema.isSingleSchema) {
                schema.schema = walkSchema(schema.schema, path);
            }
            else {
                schema.schema = clone(schema.schema);
                Object.entries(schema.schema).forEach(([type, subschema]) => {

                    const nextPath = [...path];

                    // Specify schema type in path
                    nextPath.push(`${nextPath.pop()}(${type})`);

                    schema.schema[type] = walkSchema(subschema, nextPath);
                });
            }
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
        }

        const { denormalize } = schema;
        schema.denormalize = (input, unvisit) => {

            return denormalize.call(schema, input, wrapUnvisit(unvisit));
        };

        return schema;
    };

    const schema = walkSchema(parentSchema);

    return [schema, entities];
};

exports.denormalize = (result, schema, entities, paths) => Normalizr.denormalize(result, ...exports.args(schema, entities, paths));

internals.clone = (obj) => Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);

internals.startsWith = (arr1, arr2) => {

    return arr2.every((val2, i) => {

        let val1 = arr1[i] || '';

        if (i === arr2.length - 1) {
            // TODO maybe for later: /^(.*?)(?:\((.+)\))?$/
            val1 = val1.split('(')[0];    // Ignore polymorphic relations at the end
        }

        return val1 === val2;
    });
};

internals.wrapUnvisit = (unvisit) => {

    return (id, schema) => {

        if (schema.relationKey) {
            const nextSchema = new Entity(schema.relationKey);
            // TODO also include schema property?
            // Pass along denormalize method because it also has wrapped unvisit
            nextSchema.denormalize = schema.denormalize;
            return unvisit(id, nextSchema);
        }

        return unvisit(id, schema);
    };
};
