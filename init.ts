import { parseArgs } from "util";
import { api as MisskeyApi } from "misskey-js";
import { parse } from "toml";

const { values } = parseArgs({
	args: Bun.argv,
	options: {
		instance: {
			type: "string",
			short: "i",
		},
		local: {
			type: "boolean",
			short: "l",
			default: false,
		},
	},
	strict: true,
	allowPositionals: true,
});
if (!values.instance) {
	throw new Error("Instance name is not found");
}

const dirname = import.meta.dir;
const wranglerToml = Bun.file(`${dirname}/wrangler.toml`);

const wranglerTomlContent = parse(await wranglerToml.text());
const dbNmae = wranglerTomlContent.d1_databases[0].database_name;
if (!dbNmae) {
	throw new Error("Database name is not found in wrangler.toml");
}

console.log("Database migrating...");
const migration = Bun.spawn(
	[
		"bun",
		"wrangler",
		"d1",
		"migrations",
		"apply",
		dbNmae,
		values.local ? "--local" : "",
	],
	{
		stdout: "inherit",
		stderr: "inherit",
	},
);
await migration.exited;
if (migration.exitCode !== 0) {
	throw new Error("Database migration failed");
}
console.log("Database migration done");

console.log("Initial data inserting...");

const apiClient = new MisskeyApi.APIClient({
	origin: `https://${values.instance}`,
});

const res = (await apiClient.request("emojis", {})).emojis;
const emojis = res.map((emoji) => ({
	name: emoji.name,
	category: emoji.category,
	url: emoji.url,
}));
const aliases = res.flatMap((emoji) =>
	emoji.aliases.map((alias) => ({ name: emoji.name, alias })),
);

const timestamp_ms = Date.now();
const emojiQuery = `insert into emojis (name, category, url, updatedAt) values ${emojis
	.map(
		(emoji) =>
			`('${emoji.name}', '${emoji.category}', '${emoji.url}', ${timestamp_ms})`,
	)
	.join(
		",",
	)} on conflict (name) do update set category = excluded.category, url = excluded.url, updatedAt = excluded.updatedAt`;
const aliasQuery = `insert into aliases (name, alias) values ${aliases
	.map((alias) => `('${alias.name}', '${alias.alias}')`)
	.join(",")} on conflict (name, alias) do nothing`;

const emojiInsert = Bun.spawn(
	[
		"bun",
		"wrangler",
		"d1",
		"execute",
		dbNmae,
		"--command",
		emojiQuery,
		values.local ? "--local" : "",
	],
	{
		stdout: "inherit",
		stderr: "inherit",
	},
);
const aliasInsert = Bun.spawn(
	[
		"bun",
		"wrangler",
		"d1",
		"execute",
		dbNmae,
		"--command",
		aliasQuery,
		values.local ? "--local" : "",
	],
	{
		stdout: "inherit",
		stderr: "inherit",
	},
);
await emojiInsert.exited;
await aliasInsert.exited;

if (emojiInsert.exitCode !== 0 || aliasInsert.exitCode !== 0) {
	throw new Error("Initial data inserting failed");
}
console.log("Initial data inserting done");

console.log("Upload emoji images to R2...");

const r2Bucket = wranglerTomlContent.r2_buckets[0].bucket_name;
const emojiImages = res.map((emoji) => ({
	name: emoji.name,
	url: emoji.url,
}));

const uploadEmojiImages = emojiImages.map(async (emoji) => {
	const buf = await fetch(emoji.url);
	await Bun.write(`/tmp/${emoji.name}-${timestamp_ms}`, buf);

	const upload = Bun.spawn(
		[
			"bun",
			"wrangler",
			"r2",
			"object",
			"put",
			`${r2Bucket}/${emoji.name}-${timestamp_ms}`,
			"-f",
			`/tmp/${emoji.name}-${timestamp_ms}`,
			values.local ? "--local" : "",
		],
		{
			stdout: "inherit",
			stderr: "inherit",
		},
	);

	return upload.exited;
});

await Promise.all(uploadEmojiImages);

console.log("Upload emoji images done");
