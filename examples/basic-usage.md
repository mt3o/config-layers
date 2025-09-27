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
