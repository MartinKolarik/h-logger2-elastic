module.exports.koa = {
	addRoutes (router, routes, fn) {
		routes.forEach((route) => {
			router.get(route[0], route[1], fn);
		});
	},
	middleware (apmClient, prefix = '') {
		return async (ctx, next) => {
			let matched = ctx.matched.find(r => r.name);

			if (matched && apmClient) {
				apmClient.setTransactionName(`${ctx.request.method} ${prefix}${matched.name}`);
			}

			return next();
		};
	},
};
