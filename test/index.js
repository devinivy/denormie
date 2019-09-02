'use strict';

const Code = require('@hapi/code');
const Lab = require('@hapi/lab');
const { schema: { Entity }, ...Normalizr } = require('normalizr');
const Denormie = require('../lib');

const { describe, it } = exports.lab = Lab.script();
const { expect } = Code;

describe('Denormie', () => {

    it('denormalizes specific relations.', () => {

        const dog = new Entity('dogs');
        const person = new Entity('people');
        person.define({ pet: dog, partner: person });
        dog.define({ owners: [person] });

        const pony = { id: 11, dogName: 'Pony' };
        const devin = { id: 21, name: 'Devin', pet: pony };
        const harper = { id: 22, name: 'Harper', pet: pony };
        pony.owners = [devin, harper];
        devin.partner = harper;
        harper.partner = devin;

        const { result, entities } = Normalizr.normalize([devin, harper], [person]);

        const denormalized = Denormie.denormalize(result, [person], entities, [
            ['pet'],
            ['partner', 'pet', 'owners']
        ]);

        expect(denormalized).to.equal([
            {
                id: 21,
                name: 'Devin',
                pet: { id: 11, dogName: 'Pony', owners: [21, 22] },
                partner: {
                    id: 22,
                    name: 'Harper',
                    pet: {
                        id: 11,
                        dogName: 'Pony',
                        owners: [
                            { id: 21, name: 'Devin', pet: 11, partner: 22 },
                            { id: 22, name: 'Harper', pet: 11, partner: 21 }
                        ]
                    },
                    partner: 21
                }
            },
            {
                id: 22,
                name: 'Harper',
                pet: { id: 11, dogName: 'Pony', owners: [21, 22] },
                partner: {
                    id: 21,
                    name: 'Devin',
                    pet: {
                        id: 11,
                        dogName: 'Pony',
                        owners: [
                            { id: 21, name: 'Devin', pet: 11, partner: 22 },
                            { id: 22, name: 'Harper', pet: 11, partner: 21 }
                        ]
                    },
                    partner: 22
                }
            }
        ]);
    });
});
