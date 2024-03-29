'use strict';

const PeerDepsExternal = require('rollup-plugin-peer-deps-external');
const Resolve = require('rollup-plugin-node-resolve');
const Commonjs = require('rollup-plugin-commonjs');
const Babel = require('rollup-plugin-babel');
const { terser: Terser } = require('rollup-plugin-terser');
const Filesize = require('rollup-plugin-filesize');

module.exports = [
    {
        input: 'lib/index.js',
        output: [
            {
                file: 'dist/denormie.js',
                format: 'cjs',
                exports: 'named',
                sourcemap: true
            },
            {
                file: 'dist/denormie.module.js',
                format: 'esm',
                exports: 'named',
                sourcemap: true
            }
        ],
        plugins: [
            PeerDepsExternal(),
            Resolve(),
            Commonjs(),
            Babel({ exclude: ['node_modules/**'] }),
            Filesize()
        ]
    },
    {
        input: 'lib/index.js',
        output: {
            file: 'dist/denormie.umd.min.js',
            format: 'umd',
            name: 'Denormie',
            esModule: false,
            exports: 'named',
            sourcemap: true,
            globals: {
                normalizr: 'normalizr'
            }
        },
        plugins: [
            PeerDepsExternal(),
            Resolve(),
            Commonjs(),
            Babel({ exclude: ['node_modules/**'] }),
            Terser(),
            Filesize()
        ]
    }
];
