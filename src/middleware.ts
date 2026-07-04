import { defineMiddleware } from 'astro:middleware';
import { paraglideMiddleware } from './paraglide/server.js';

export const onRequest = defineMiddleware((context, next) =>
	paraglideMiddleware(context.request, ({ request }) => {
		context.request = request;
		return next();
	})
);
