import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { emojis } from "./emoji";

export const aliases = sqliteTable(
	"aliases",
	{
		name: text("name")
			.notNull()
			.references(() => emojis.name, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		alias: text("alias").notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.name, table.alias] }),
	}),
);
