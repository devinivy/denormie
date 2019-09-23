'use strict';

exports.parse = (paths) => {

    const log = (fn) => {

        return (state, tok, i, arr) => {

            console.log({ tok });

            const next = fn(state, tok, i, arr);

            console.log(require('util').inspect({ next }, { depth: null, colors: true }));

            return next;
        };
    };

    const processToken = log((state, tok, i, arr) => {

        const { results = [], item = [], stack = 0, stop = false, root = false } = state;

        if (tok.end) {

            if (root && stack) {
                throw new Error('Unbalanced brackets.');
            }

            return item ? [...results, item] : results;
        }
        else if (tok === '' || tok === '.' || stop) {
            return state;
        }
        else if (tok === '[') {

            const listResults = arr.slice(i + 1).reduce(processToken, {});

            return { ...state, stack: stack + 1, results: stack ? results : [...results, ...listResults.map((r) => [...item, ...r])], item: stack ? item : null };
        }
        else if (tok === ']') {
            return { ...state, stack: stack - 1, stop: (stack === 0) };
        }
        else if (tok === ',') {
            return { ...state, results: item ? [...results, item] : results, item: [] };
        }

        return { ...state, item: [...item, tok] };
    });

    return paths.replace(/\s/g, '')
        .split(/(?=[\[\],\.])/)
        .reduce((collect, m) => ([...collect, m.charAt(0), m.slice(1)]), [])
        .concat({ end: true })
        .reduce(processToken, { root: true });
};

// [a, b.[c, d]]

console.log(exports.parse('[a,b.[c,def]]'));
