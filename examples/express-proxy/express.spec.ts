import {describe, it, expect, vi} from "vitest";
import {LayeredConfig} from "../../src";

/*
In this example, we configure a simple bypass-proxy in express app, that will forward requests to internal services. To configure the services we set up a layered config with two layers:
1. base layer: contains general settings, including enabled services and database connection details.
2. services layer: defines the target URLs and HTTP methods for each service.

The proxy setup reads from this configuration to dynamically create routes in the express app that forward requests to the appropriate internal service based on the configuration.

Of course this is a simplified example, in a real-world scenario you would likely add error handling, logging, and other features to the proxy logic. And use reall expressjs app instead of a mock.
 */

//We mock express, because this is a test!
const app = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
}

type HttpMethods = 'get' | 'post' | 'put' | 'delete' | 'patch';

type ProxySetup = {
    enabled: Array<string>;
    authentication_cookie: string;
    database?:{
        host: string;
        port: number;
        password: ()=>string;
        name:string;
    },
    services: Record<string, {
        target: string;
        changeOrigin: boolean;
        methods: Array<HttpMethods>;
        passBody?: boolean;
        passHeaders?: boolean;
    }>;
}

const cfg = LayeredConfig.fromLayers<ProxySetup>([
    {name: 'services', config:{

        services:{
            users:{
                target: 'http://users.internal.local',
                changeOrigin: true,
                methods: ['get', 'post', 'put', 'delete', 'patch'],
                passBody: true,
                passHeaders: true
            },
            orders:{
                target: 'http://orders.internal.local',
                changeOrigin: true,
                methods: ['get', 'post'],
                passBody: true,
                passHeaders: true
            }
        }


    }},
    {name: 'base', config:{
        enabled: ['users', 'orders'],
        database: {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
            password: ()=>process.env.DB_PASSWORD || 'defaultpassword',
            name: 'appdb'
        },
        authentication_cookie: process.env.AUTH_COOKIE || 'SESSION=abcdef1234567890',
    }},
]);

const cookie_header = {
    'Cookie': `${cfg.authentication_cookie}`
}


cfg.enabled.forEach(serviceName=>{
    const {target, methods, passBody, passHeaders} = cfg.services[serviceName];
    //Here we setup the bypass proxy in express
    methods.forEach(methodName=>{
        //call for http methods: get/post/put/delete/patch
        //equivalent of explicit calls for: app.get/post/put/delete/patch
        app[methodName]( target, async (req:any, res:any)=>{

            let origin = req.headers['origin'] || '';
            let headers = req.headers;
            if(!cfg.services[serviceName].changeOrigin){
                //We block changing the origin header if changeOrigin is false
                headers = {...headers, origin};
            }

            const response = await fetch(target, {
                method: methodName,
                body: passBody ? req.body : undefined,
                headers: passHeaders ? {
                    headers,
                    ...cookie_header,
                } : cookie_header,
            });
            const responseBody = await response.text();
            res.status(response.status).send(responseBody);
        });
    });
});

describe('Express Proxy Setup', ()=>{
    it('should setup proxy routes in express app', ()=>{
        expect(app.get).toHaveBeenCalledWith('http://users.internal.local', expect.any(Function));
        expect(app.post).toHaveBeenCalledWith('http://users.internal.local', expect.any(Function));
        expect(app.put).toHaveBeenCalledWith('http://users.internal.local', expect.any(Function));
        expect(app.delete).toHaveBeenCalledWith('http://users.internal.local', expect.any(Function));
        expect(app.patch).toHaveBeenCalledWith('http://users.internal.local', expect.any(Function));

        expect(app.get).toHaveBeenCalledWith('http://orders.internal.local', expect.any(Function));
        expect(app.post).toHaveBeenCalledWith('http://orders.internal.local', expect.any(Function));

        //Orders does not have put/delete/patch methods
        expect(app.put).not.toHaveBeenCalledWith('http://orders.internal.local', expect.any(Function));
        expect(app.delete).not.toHaveBeenCalledWith('http://orders.internal.local', expect.any(Function));
        expect(app.patch).not.toHaveBeenCalledWith('http://orders.internal.local', expect.any(Function));
    })
});
