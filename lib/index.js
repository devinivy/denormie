'use strict';

const {
    schema: {
        Entity,
        Union: UnionSchema,
        Array: ArraySchema,
        Values: ValuesSchema,
        Object: ObjectSchema
    },
    ...Normalizr
} = require('normalizr');

const internals = {};

exports.args = (parentSchema, entities, paths) => {

    entities = { ...entities };

    const { clone, startsWith, wrapUnvisit } = internals;

    const walkSchema = (schema, path = []) => {

        if (!schema) {
            return schema;
        }

        schema = (schema.denormalize && typeof schema.denormalize === 'function') ? clone(schema) :
            Array.isArray(schema) ? new ArraySchema(schema[0]) : new ObjectSchema(schema);

        if (schema instanceof Entity || schema instanceof ObjectSchema) {

            const isEntity = schema instanceof Entity;

            schema.schema = clone(schema.schema);

            Object.entries(schema.schema).forEach(([relationOrProp, subschema]) => {

                const nextPath = [...path, relationOrProp];

                if (paths.some((p) => startsWith(p, nextPath, { ignorePolymorphic: isEntity }))) {
                    schema.schema[relationOrProp] = walkSchema(subschema, nextPath);
                }
                else {
                    delete schema.schema[relationOrProp];
                }
            });

            if (isEntity && path.length) {
                schema.relationKey = `${schema.key}:${path.join('.')}`;
                entities[schema.relationKey] = entities[schema.key];
            }
        }
        else if (schema instanceof ArraySchema || schema instanceof UnionSchema || schema instanceof ValuesSchema) {

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

internals.startsWith = (arr1, arr2, { ignorePolymorphic }) => {

    return arr2.every((val2, i) => {

        let val1 = arr1[i] || '';

        if (ignorePolymorphic && (i === arr2.length - 1)) {
            // TODO maybe for later: /^(.*?)(?:\((.+)\))?$/
            val1 = val1.split('(')[0];    // Ignore polymorphic relations at the end
        }

        return val1 === val2;
    });
};

internals.wrapUnvisit = (unvisit) => {

    return (id, schema) => {

        if (schema && schema.relationKey) {
            const nextSchema = new Entity(schema.relationKey);
            // TODO also include schema property?
            // Pass along denormalize method because it also has wrapped unvisit
            nextSchema.denormalize = schema.denormalize;
            return unvisit(id, nextSchema);
        }

        return unvisit(id, schema);
    };
};
