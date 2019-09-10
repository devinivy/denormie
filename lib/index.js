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

const StableStringify = require('json-stable-stringify')

const internals = {};

exports.applyPaths = (parentSchema, paths) => {

    const { clone, startsWith, wrapUnvisit } = internals;

    const entityAliases = {};

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
                entityAliases[schema.relationKey] = schema.key;
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

    schema.applyEntityAliases = (entities) => {

        entities = { ...entities };

        Object.entries(entityAliases).forEach(([from, to]) => {

            entities[from] = entities[to];
        });

        return entities;
    };

    return schema;
};

exports.denormalize = (result, schema, entities, paths) => {

    if (paths) {
        schema = exports.applyPaths(schema, paths);
    }

    if (schema.applyEntityAliases) {
        entities = schema.applyEntityAliases(entities);
    }

    return Normalizr.denormalize(result, schema, entities);
};

exports.createSelector = (getEntities, getResult, parentSchema, paths) => {

    if (paths) {
        parentSchema = exports.applyPaths(parentSchema, paths);
    }

    const { clone } = internals;

    let lastEntities

    const walkSchema = (schema) => {

        if (!schema || schema._isSelectorized) {
            return schema;
        }

        schema = (schema.denormalize && typeof schema.denormalize === 'function') ? clone(schema) :
            Array.isArray(schema) ? new ArraySchema(schema[0]) : new ObjectSchema(schema);

        schema._isSelectorized = true;
        schema._cache = {};

        const { denormalize } = schema;

        let lastEntities;
        let currentEntities = {};

        if (schema instanceof Entity) {
            schema.denormalize = (input, unvisit) => {

                // input: { ...entity, relation1: id1 }
                const denormalized = denormalize.call(schema, input, unvisit);
                const cacheKey = schema.getId(input);

                if (schema._cache[cacheKey] &&
                    lastEntities[schema.key] && currentEntities[schema.key] &&
                    lastEntities[schema.key][cacheKey] === currentEntities[schema.key][cacheKey] &&
                    Object.keys(schema.schema).every((relation) => schema._cache[cacheKey][relation] === denormalized[relation])) {
                    return schema._cache[cacheKey];
                }

                schema._cache

                return denormalized;
            };
        }
        // else if (schema instanceof UnionSchema) {
        //     schema.denormalize = (input, unvisit) => {

        //         // input: { schema, id }
        //         const denormalized = denormalize.call(schema, input, unvisit);

        //         return denormalized;
        //     };
        // }
        else if (schema instanceof ArraySchema) {
            schema.denormalize = (input, unvisit) => {

                // input: [id1, id2, idN]
                const denormalized = denormalize.call(schema, input, unvisit);
                const cacheKey = StableStringify(input);

                if (schema._cache[cacheKey] && schema._cache[cacheKey].length && denormalized.length &&
                    denormalized.every((item, i) => item === schema._cache[cacheKey][i])) {
                    return schema._cache[cacheKey];
                }

                return denormalized;
            };
        }
        else if (schema instanceof ValuesSchema) {
            schema.denormalize = (input, unvisit) => {

                // input: { key1: id1, key2: id2, keyN: idN }
                const denormalized = denormalize.call(schema, input, unvisit);
                const cacheKey = StableStringify(input);

                return denormalized;
            };
        }
        else if (schema instanceof ObjectSchema) {
            schema.denormalize = (input, unvisit) => {

                // input: { key1: id1, key2: id2 }
                const denormalized = denormalize.call(schema, input, unvisit);
                const cacheKey = StableStringify(input);

                return denormalized;
            };
        }

        if (schema.isSingleSchema) {
            schema.schema = walkSchema(schema.schema);
        } else {
            schema.schema = Object.entries(schema.schema)
                .reduce((collect, [relationOrPropOrType, subschema]) => ({
                    ...collect,
                    [relationOrPropOrType]: walkSchema(subschema)
                }), {});
        }

        return schema;
    };

    const schema = walkSchema(parentSchema);

    return (state) => {

        lastEntities = entities;
        entities = getEntities(state);

    };
};

// Denormie.createSelector(
//     ({ model }) => model.entities,
//     ({ model }) => model.indexes.x && model.indexes.x.result,
//     Denormie.applyPaths([person], [
//          ['pets', 'favoriteFood']
//     ])
// );

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
