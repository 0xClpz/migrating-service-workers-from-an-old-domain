# Migrating your service workers from an old domain to your new domain

Recently we ran into the following problem, we had our website on https://www.hackages.io then we decided to migrate it to https://hackages.io, sounds easy right ? We just wrote a 301 redirect from the old domain name to the new one.


The thing we did not think about was that service workers don't play right with redirects.

So the issue was the following:

Users would go on https://www.hackages.io, nginx would send them a 301 redirect for every ressources they'd send a request for.

This worked perfectly fine for ***new*** users but users who had already visited the website would encounter some issues.

Service-workers update themselves automatically if there's a new version available, in our case it tried to get the new version on https://hackages.io/service-worker.js but the user was still on https://www.hackages.io/ which caused the following error:

![Service-worker redirect error](http://i.imgur.com/QqhI8Oo.png)

Since the service worker could not get the ressources behind the redirect, users would just see the old version of the website.

Let's reproduce the issue locally then tackle it down.

Let's build two NGINX docker image both using this conf
(Associated dockerfiles can be found [here](repo url))
```conf
server {
    listen       80;
    server_name  localhost;
    root /usr/share/nginx/html;

    location = /service-worker.js {
        add_header Cache-Control no-cache;
        add_header Cache-Control no-store;
        add_header Max-Age 0;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
and service the following service-worker
```JavaScript
const ressources = [
  '/',
  '/index.html',
  '/style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('sw-demo').then((cache) =>
      cache.addAll(ressources)
    )
  );
 });

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) =>
      response || fetch(event.request)
    )
  );
});
```

We'll run one of them on localhost:1500 (representing https://www.hackages.io) and localhost:2000(representing https://hackages.io).

![website-a and website-b](http://i.imgur.com/G7MoSCX.png)

Now, let's kill localhost:1500 and run this nginx conf instead to redirect all the trafic to localhost:2000
```conf
server {
    listen       80;
    server_name  localhost;

    location / {
        return 301 http://localhost:2000$request_uri;
    }
}
```

New users will get the new version, no problem, but old users will still encounter the issue mentionned below, the service-worker will try to get the new service worker which is behind a redirect and thats ... prohibited.

So now all your old users are stuck with your website on the old domain name and are not being redirected because the service worker hijacks it.

## Destroying the old service-worker
The strategy to fix the problem will be the following:
Craft a service worker that is going to delete the previous one and serve that service-worker in the nginx that handles the redirect.

We'll use this nginx conf to redirect everything but still serve our specially crafted service-worker:
```nginx
server {
    listen       80;
    server_name  localhost;

    location = /service-worker.js {
        root /usr/share/nginx/html;
        add_header Cache-Control no-cache;
        add_header Cache-Control no-store;
        add_header Max-Age 0;
    }

    location / {
        return 301 http://localhost:2000$request_uri;
    }
}
```

The first version we had was the following:
```JavaScript
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', () => {
  self.registration.unregister();
});
```
Let's break it down:
```JavaScript
self.addEventListener('install', () => self.skipWaiting());
```
_self.skipWaiting()_ forces the waiting service worker to become the active service worker so if an user has multiple tabs open it kicks in instantly.

```JavaScript
self.addEventListener('activate', () => {
  self.registration.unregister();
});
```
The unregister method of the registration will delete any service worker registered for the host:port combo the service worker is registered on.

This method works .. fine, it unregisters the service worker and on the second visit the clients who already had visited the website will be redirected to the new website.

But let's break it down and build a better version of it that will force the user on the new domain.

In our case we did not want the users to still see the *old* website so we had to find a way to reload their browser after unregistering the service-worker.

In a service worker you can't simply do:
```JavaScript
window.location.replace('whatever.com');
```
because you don't have access to *a lot* of things, including window. 

First let's grab the list of clients using:
```JavaScript
self.clients.matchAll({type: 'window});
```
This returns us a promise containing the list of windowClient of type window (tabs).

Then each client will expose a navigate method that allows us to redirect the client to another page.

```JavaScript
self.clients.matchAll({type: 'window'})
  .then(clients => {
    for(const client of clients){
      client.navigate(client.url);
    }
  });
```
Here we just use it to refrech each tab of the user browser.

Putting it all together:
```JavaScript
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', () => {
  self.registration.unregister();
  self.clients.matchAll({ type: 'window' }).then(clients => {
    for (const client of clients) {
      client.navigate(client.url);
    }
  });
});
```
To recap:
- It's going to activate instantly the service-worker
- It's going to tell the service-worker to unregister itself
- Finally it's going to refresh each tab of the user


## In action:

![Service-worker kill switch](https://i.imgur.com/cNLHYAr.gif)

