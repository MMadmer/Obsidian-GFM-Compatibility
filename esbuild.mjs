import esbuild from "esbuild";

const shouldWatch = process.argv.includes("--watch");

const buildOptions = {
	entryPoints: ["main.ts"],
	bundle: true,
	external: ["obsidian"],
	format: "cjs",
	logLevel: "info",
	outfile: "main.js",
	platform: "browser",
	sourcemap: "inline",
	target: "es2020"
};

if (shouldWatch)
{
	const context = await esbuild.context(buildOptions);
	await context.watch();
	console.log("[gfm-compatibility] watching for changes");
}
else
{
	await esbuild.build(buildOptions);
}
