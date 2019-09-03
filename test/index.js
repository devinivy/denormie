'use strict';

const Code = require('@hapi/code');
const Lab = require('@hapi/lab');
const { schema: { Entity, Array: ArraySchema }, ...Normalizr } = require('normalizr');
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

    it('denormalizes shallow polymorphic array items.', () => {

        const dog = new Entity('dogs');
        const cat = new Entity('cats');
        const person = new Entity('people');
        cat.define({ owner: person });
        dog.define({ owner: person });
        person.define({ pets: new ArraySchema({ dog, cat }, ({ type }) => type) });

        const pupper = { id: 11, type: 'dog', name: 'Pupper' };
        const purrer = { id: 12, type: 'cat', name: 'Purrer' };
        const devin = { id: 21, name: 'Devin', pets: [pupper, purrer] };
        pupper.owner = devin;
        purrer.owner = devin;

        const { result, entities } = Normalizr.normalize(devin, person);

        const denormalized = Denormie.denormalize(result, person, entities, [
            ['pets']
        ]);

        expect(denormalized).to.equal({
            id: 21,
            name: 'Devin',
            pets: [
                { id: 11, type: 'dog', name: 'Pupper', owner: 21 },
                { id: 12, type: 'cat', name: 'Purrer', owner: 21 }
            ]
        });
    });

    it('denormalizes deep polymorphic array items.', () => {

        const dog = new Entity('dogs');
        const cat = new Entity('cats');
        const person = new Entity('people');
        cat.define({ owner: person });
        dog.define({ owner: person });
        person.define({ pets: new ArraySchema({ dog, cat }, ({ type }) => type) });

        const pupper = { id: 11, type: 'dog', name: 'Pupper' };
        const purrer = { id: 12, type: 'cat', name: 'Purrer' };
        const devin = { id: 21, name: 'Devin', pets: [pupper, purrer] };
        pupper.owner = devin;
        purrer.owner = devin;

        const { result, entities } = Normalizr.normalize(devin, person);

        const denormalized = Denormie.denormalize(result, person, entities, [
            ['pets(cat)', 'owner']
        ]);

        expect(denormalized).to.equal({
            id: 21,
            name: 'Devin',
            pets: [
                {
                    id: 11,
                    type: 'dog',
                    name: 'Pupper',
                    owner: 21
                },
                {
                    id: 12,
                    type: 'cat',
                    name: 'Purrer',
                    owner: {
                        id: 21,
                        name: 'Devin',
                        pets: [
                            { id: 11, schema: 'dog' },
                            { id: 12, schema: 'cat' }
                        ]
                    }
                }
            ]
        });
    });
});
