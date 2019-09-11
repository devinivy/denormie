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

// Denormie.createSelector(
//     ({ model }) => model.entities,
//     ({ model }) => model.indexes.x && model.indexes.x.result,
//     Denormie.applyPaths([person], [
//          ['pets', 'favoriteFood']
//     ])
// );

exports.createSelector = (getEntities, getResult, parentSchema, paths) => {

    if (paths) {
        parentSchema = exports.applyPaths(parentSchema, paths);
    }

    const { clone } = internals;

    let lastEntities;
    let currentEntities = {};
    const schemas = [];

    const cacheDenormalizeBy = ({ schema, getCacheKey, getIsEquivalent }) => {

        const { denormalize } = schema;

        return (input, ...args) => {

            let result = denormalize.call(schema, input, ...args);

            const cacheKey = getCacheKey(input, ...args);
            const hasCacheItem = schema._cache.hasOwnProperty(cacheKey);
            const cacheItem = schema._cache[cacheKey];

            if (hasCacheItem && getIsEquivalent(result, cacheItem, cacheKey)) {
                result = cacheItem;
            }

            schema._nextCache[cacheKey] = result;

            return result;
        };
    };

    const walkSchema = (schema) => {

        if (!schema || schema._isSelectorized) {
            return schema;
        }

        schema = (schema.denormalize && typeof schema.denormalize === 'function') ? clone(schema) :
            Array.isArray(schema) ? new ArraySchema(schema[0]) : new ObjectSchema(schema);

        schema._isSelectorized = true;
        schema._cache = null;
        schema._nextCache = {};
        schemas.push(schema);

        // Note, no need to check UnionSchema since it's a passthrough to one of these 

        if (schema instanceof Entity) {
            schema.denormalize = cacheDenormalizeBy({
                schema,
                getCacheKey: (input) => schema.getId(input),
                getIsEquivalent: (result, cacheItem, cacheKey) => {

                    return lastEntities[schema.key] && currentEntities[schema.key] &&
                        lastEntities[schema.key][cacheKey] === currentEntities[schema.key][cacheKey] &&
                        Object.keys(schema.schema).every((relation) => cacheItem[relation] === result[relation]);
                }
            });
        }
        else if (schema instanceof ArraySchema) {
            schema.denormalize = cacheDenormalizeBy({
                schema,
                getCacheKey: (input) => StableStringify(input),
                getIsEquivalent: (result, cacheItem) => {

                    return cacheItem.length === result.length &&
                        result.every((item, i) => item === cacheItem[i]);
                }
            });
        }
        else if (schema instanceof ValuesSchema) {
            schema.denormalize = cacheDenormalizeBy({
                schema,
                getCacheKey: (input) => StableStringify(input),
                getIsEquivalent: (result, cacheItem) => {

                    const resultKeys = Object.keys(result);
                    const cacheItemKeys = Object.keys(cacheItem);

                    return resultKeys.length === cacheItemKeys.length &&
                        resultKeys.every((key) => result[key] === cacheItem[key]);
                }
            });
        }
        else if (schema instanceof ObjectSchema) {
            schema.denormalize = cacheDenormalizeBy({
                schema,
                getCacheKey: (input) => {

                    input = Object.keys(schema.schema).reduce((collect, prop) => ({
                        ...collect,
                        [prop]: input[prop]
                    }), {});

                    return StableStringify(input);
                },
                getIsEquivalent: (result, cacheItem) => {

                    const resultKeys = Object.keys(result);
                    const cacheItemKeys = Object.keys(cacheItem);

                    return resultKeys.length === cacheItemKeys.length &&
                        resultKeys.every((key) => result[key] === cacheItem[key]);
                }
            });
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

    parentSchema = walkSchema(parentSchema);

    return (state) => {

        lastEntities = currentEntities;
        currentEntities = getEntities(state);
        schemas.forEach((schema) => {

            schema._cache = schema._nextCache;
            schema._nextCache = {};
        });

        return exports.denormalize(getResult(state), parentSchema, currentEntities);
    };
};

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
