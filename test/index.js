'use strict';

const Code = require('@hapi/code');
const Lab = require('@hapi/lab');
const {
    schema: {
        Entity,
        Union: UnionSchema,
        Array: ArraySchema
    },
    ...Normalizr
} = require('normalizr');
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

    it('denormalizes relations unambiguously, sans circular dependencies.', () => {

        const person = new Entity('people');
        person.define({ self: person });

        const devin = { id: 21, name: 'Devin', self: null };
        devin.self = devin;

        const { result, entities } = Normalizr.normalize(devin, person);

        const denormalized = Denormie.denormalize(result, person, entities, [
            ['self', 'self', 'self']
        ]);

        expect(denormalized).to.equal({
            id: 21,
            name: 'Devin',
            self: {
                id: 21,
                name: 'Devin',
                self: {
                    id: 21,
                    name: 'Devin',
                    self: {
                        id: 21,
                        name: 'Devin',
                        self: 21
                    }
                }
            }
        });
    });

    it('denormalizes shallow polymorphic array items.', () => {

        const dog = new Entity('dogs');
        const cat = new Entity('cats');
        const person = new Entity('people');
        cat.define({ owner: person });
        dog.define({ owner: person });
        person.define({ pets: new ArraySchema({ dog, cat }, 'type') });

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
        person.define({ pets: new ArraySchema({ dog, cat }, 'type') });

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

    it('denormalizes object schemas.', () => {

        const person = new Entity('people');
        const location = new Entity('locations');
        person.define({ lastTrip: { from: location, to: location } });
        location.define({ mayor: person });

        const portland = { id: 11, city: 'Portland', state: 'ME' };
        const boston = { id: 12, city: 'Boston', state: 'MA' };
        const burlington = { id: 13, city: 'Burlington', state: 'VT' };
        const devin = { id: 21, name: 'Devin', lastTrip: { from: portland, to: burlington } };
        const harper = { id: 22, name: 'Harper', lastTrip: { from: boston, to: portland } };
        portland.mayor = harper;
        boston.mayor = devin;
        burlington.mayor = harper;

        const { result, entities } = Normalizr.normalize(devin, person);

        const denormalized = Denormie.denormalize(result, person, entities, [
            ['lastTrip', 'from'],
            ['lastTrip', 'to', 'mayor', 'lastTrip', 'from']
        ]);

        expect(denormalized).to.equal({
            id: 21,
            name: 'Devin',
            lastTrip: {
                from: {
                    id: 11,
                    city: 'Portland',
                    state: 'ME',
                    mayor: 22
                },
                to: {
                    id: 13,
                    city: 'Burlington',
                    state: 'VT',
                    mayor: {
                        id: 22,
                        name: 'Harper',
                        lastTrip: {
                            from: {
                                id: 12,
                                city: 'Boston',
                                state: 'MA',
                                mayor: 21
                            },
                            to: 11
                        }
                    }
                }
            }
        });
    });

    it('denormalizes shallow polymorphic union items.', () => {

        const dog = new Entity('dogs');
        const cat = new Entity('cats');
        const animal = new UnionSchema({ dog, cat }, 'type');
        const person = new Entity('people');
        cat.define({ owner: person });
        dog.define({ owner: person });
        person.define({ pet: animal });

        const pupper = { id: 11, type: 'dog', name: 'Pupper' };
        const purrer = { id: 12, type: 'cat', name: 'Purrer' };
        const devin = { id: 21, name: 'Devin', pet: pupper };
        const harper = { id: 22, name: 'Harper', pet: purrer };
        pupper.owner = devin;
        purrer.owner = harper;

        const { result, entities } = Normalizr.normalize([devin, harper], [person]);

        const denormalized = Denormie.denormalize(result, [person], entities, [
            ['pet']
        ]);

        expect(denormalized).to.equal([
            {
                id: 21,
                name: 'Devin',
                pet: {
                    id: 11,
                    type: 'dog',
                    name: 'Pupper',
                    owner: 21
                }
            },
            {
                id: 22,
                name: 'Harper',
                pet: {
                    id: 12,
                    type: 'cat',
                    name: 'Purrer',
                    owner: 22
                }
            }
        ]);
    });

    it('denormalizes deep polymorphic union items.', () => {

        const dog = new Entity('dogs');
        const cat = new Entity('cats');
        const animal = new UnionSchema({ dog, cat }, 'type');
        const person = new Entity('people');
        cat.define({ owner: person });
        dog.define({ owner: person });
        person.define({ partner: person, pet: animal });

        const pupper = { id: 11, type: 'dog', name: 'Pupper' };
        const purrer = { id: 12, type: 'cat', name: 'Purrer' };
        const devin = { id: 21, name: 'Devin', pet: pupper };
        const harper = { id: 22, name: 'Harper', pet: purrer };
        pupper.owner = devin;
        purrer.owner = harper;
        devin.partner = harper;
        harper.partner = devin;

        const { result, entities } = Normalizr.normalize([devin, harper], [person]);

        const denormalized = Denormie.denormalize(result, [person], entities, [
            ['pet(cat)', 'owner'],
            ['pet(dog)', 'owner', 'partner']
        ]);

        expect(denormalized).to.equal([
            {
                id: 21,
                name: 'Devin',
                partner: 22,
                pet: {
                    id: 11,
                    type: 'dog',
                    name: 'Pupper',
                    owner: {
                        id: 21,
                        name: 'Devin',
                        partner: {
                            id: 22,
                            name: 'Harper',
                            partner: 21,
                            pet: { id: 12, schema: 'cat' }
                        },
                        pet: { id: 11, schema: 'dog' }
                    }
                }
            },
            {
                id: 22,
                name: 'Harper',
                partner: 21,
                pet: {
                    id: 12,
                    type: 'cat',
                    name: 'Purrer',
                    owner: {
                        id: 22,
                        name: 'Harper',
                        partner: 21,
                        pet: { id: 12, schema: 'cat' }
                    }
                }
            }
        ]);
    });
});
