const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
    app.use(
        createProxyMiddleware("/oidc/", {
            target: "http://localhost:15000/",
        })
    );

    app.use((req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
        res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
		next();
	});

};
