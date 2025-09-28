// Example: Validate a complex configuration object using Zod
import {describe, it, expect} from 'vitest';
import {z} from 'zod';

// Define a complex configuration schema with Zod
const ConfigSchema = z.object({
    api: z.object({
        url: z.string().url(),
        timeout: z.number().int().min(100).max(10000),
        features: z.object({
            enableBeta: z.boolean(),
            maxUsers: z.number().int().positive(),
            tags: z.array(z.string()),
        }),
    }),
    auth: z.object({
        jwtSecret: z.string().min(32),
        providers: z.array(z.enum(['google', 'github', 'email'])),
    }),
    logging: z.object({
        level: z.enum(['debug', 'info', 'warn', 'error']),
        destinations: z.array(z.string()),
    }),
    maintenance: z.object({
        enabled: z.boolean(),
        window: z.object({
            start: z.string().datetime(),
            end: z.string().datetime(),
        }).optional(),
    }),
    //foo: z.string(), //adding this will cause validation to fail unless config has foo
});

const layers = [
    {
        name: 'default',
        config: {
            api: {
                timeout: 8000,
                features: {
                    maxUsers: 10,
                    tags: [],
                },
            },
            auth: {
                jwtSecret: undefined,
                providers: [],
            },
            logging: {
                level: 'info',
                destinations: ['stdout'],
            },
            maintenance: {
                enabled: false,
            },
        },
    },
    {
        name: 'base',
        config: {
            api: {
                timeout: 3000,
                features: {
                    maxUsers: 50,
                    tags: ['env', 'beta'],
                },
            },
            auth: {
                providers: ['google', 'email'],
            },
            logging: {
                level: 'info',
            },
        },
    },
    {
        name: 'prod',
        config: {
            api: {
                url: 'https://super.website.com/api',
                timeout: 5000,
                features: {
                    enableBeta: true,
                    tags: ['alpha', 'beta'],
                },

            },
            auth: {
                jwtSecret: 'supersecretjwtkeythatislongenough',
                providers: ['google', 'github'],
            },
            logging: {
                level: 'warn',
                destinations: ['stdout', 'file'],
            },
            maintenance: {
                enabled: false,
            },
        },
    },
];

import {LayeredConfig} from '../../dist/config-layers.js';

const layered = LayeredConfig.fromLayers(layers);

describe('validate with zod', () => {

    it('has correct values and validates', () => {

        // Validate the resolved layered config object with zod
        expect(() => {
            ConfigSchema.parse(
                Object.fromEntries(Object.entries(layered))
            );
        }).not.toThrow();

        //structure matches the schema for simple fields
        expect(Object.keys(layered.api)).toStrictEqual(["timeout", "features", "url"]);
        //structure matches the schema for nested fields
        expect(Object.keys(layered.api.features)).toStrictEqual(["maxUsers", "tags", "enableBeta"]);
        //values are correctly overridden from layers
        expect(layered.api).toStrictEqual({
            "features": {
                "enableBeta": true,
                "maxUsers": 50,
                "tags": [
                    "alpha",
                    "beta",
                ],
            },
            "timeout": 5000,
            "url": "https://super.website.com/api",
        });

    });
});
