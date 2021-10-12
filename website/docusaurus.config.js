const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
    title: "OIDC Client TS",
    url: "https://your-docusaurus-test-site.com",
    baseUrl: "/",
    onBrokenLinks: "throw",
    onBrokenMarkdownLinks: "warn",
    favicon: "img/favicon.ico",
    organizationName: "kherock", // Usually your GitHub org/user name.
    projectName: "oidc-client", // Usually your repo name.
    plugins: [
        [
            "docusaurus-plugin-typedoc",

            // Plugin / TypeDoc options
            {
                entryPoints: ["../src/index.ts"],
                tsconfig: "../tsconfig.json",
                docsRoot: "../docs",
                disableSources: true,
                excludePrivate: true,
                readme: "none",
            },
        ],
    ],
    themeConfig: {
        navbar: {
            title: "OIDC Client TS",
            items: [
                {
                    type: "doc",
                    docId: "api/index",
                    position: "left",
                    label: "API",
                },
                {
                    href: "https://github.com/kherock/oidc-client",
                    label: "GitHub",
                    position: "right",
                },
            ],
        },
        footer: {
            style: "dark",
            links: [
                {
                    title: "Docs",
                    items: [
                        {
                            label: "Tutorial",
                            to: "/docs/intro",
                        },
                    ],
                },
                {
                    title: "More",
                    items: [
                        {
                            label: "GitHub",
                            href: "https://github.com/kherock/oidc-client",
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} OIDC Client TS, Inc. Built with Docusaurus.`,
        },
        prism: {
            theme: lightCodeTheme,
            darkTheme: darkCodeTheme,
        },
    },
    presets: [
        [
            "@docusaurus/preset-classic",
            {
                docs: {
                    path: "../docs",
                    sidebarPath: require.resolve("./sidebars.js"),
                    routeBasePath: "/",
                    editUrl:
                        "https://github.com/kherock/oidc-client/edit/master/docs/",
                },
                theme: {
                    customCss: require.resolve("./src/css/custom.css"),
                },
            },
        ],
    ],
};
