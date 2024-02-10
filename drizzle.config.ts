import type { Config } from "drizzle-kit";

export default {
	schema: ["src/repository/alias.ts", "src/repository/emoji.ts"],
	out: "migrations",
	driver: "d1",
	dbCredentials: {
		dbName: "mi-kitazawa-emojis",
		wranglerConfigPath: "wrangler.toml",
	},
} satisfies Config;
