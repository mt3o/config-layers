# Basic usage

We create a simple setup for express.js application that relies on a simple setup, and proxies some requests to the backend server

```ts

type ConfigSchema = {
    envName: 'dev' | 'staging' | 'production';
}

type ProxySetup = {
    enabled: Array<string>;
    database?:{
        host: string;
        port: number;
        password: ()=>string;
        name:string;
    },
    services: Record<string, { 
        target: string; 
        changeOrigin: boolean;
        methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>;
        passBody?: boolean;
        passHeaders?: boolean;
    }>;
} 

```

The assumption is that we have a config file that defines the proxy setup, and we want to create a proxy middleware for express.js that will handle the requests based on this configuration.
To avoid repeating ourselves, when adding more services, we will create a function that will generate the proxy middleware for each service based on the configuration. So adding new services - is only a matter of updating the config file.

This use case is based on real scenario, where developer setup uses a local proxy that passes the requests to real backend services, and allows to easily switch between different environments (dev, staging, production) by changing the config file. Requests to real backends require adding the authentication cookie, but we don't want to set it up locallyy - so the proxy will handle that for us.

```ts
