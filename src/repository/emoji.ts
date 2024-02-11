import { SQL, and, eq, gte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { aliases } from "./alias";

export const emojis = sqliteTable("emojis", {
  name: text("name").primaryKey(),
  category: text("category"),
  url: text("url").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(STRFTIME('%s', 'now') * 1000)`),
});

export type DBEmoji = {
  name: string;
  category: string | null;
  url: string;
  updatedAt: Date;
  aliases: string[];
};
export type DBEmojis = DBEmoji[];

export class EmojiRepository {
  private readonly db;

  constructor(D1: D1Database) {
    this.db = drizzle(D1);
  }

  private toEmojiAndAliases(
    input: {
      emoji: {
        name: string;
        category: string | null;
        url: string;
        updatedAt: Date;
      };
      alias: string | null;
    }[],
  ): DBEmojis {
    const result = input.reduce<DBEmojis>((acc, row) => {
      const index = acc.findIndex((emoji) => emoji.name === row.emoji.name);
      if (index === -1) {
        acc.push({
          name: row.emoji.name,
          category: row.emoji.category,
          url: row.emoji.url,
          updatedAt: row.emoji.updatedAt,
          aliases: row.alias ? [row.alias] : [],
        });
      } else {
        if (row.alias) {
          acc[index].aliases.push(row.alias);
        }
      }

      return acc;
    }, []);

    return result;
  }

  async get(name: string): Promise<
    | {
        result: "ok";
        value: DBEmoji;
      }
    | {
        result: "err";
        error: string;
      }
  > {
    const result = await this.db
      .select({
        emoji: emojis,
        alias: aliases.alias,
      })
      .from(emojis)
      .leftJoin(aliases, eq(emojis.name, aliases.name))
      .where(eq(emojis.name, name))
      .all();
    if (result.length === 0) {
      return {
        result: "err",
        error: "not found",
      };
    }

    return {
      result: "ok",
      value: this.toEmojiAndAliases(result)[0],
    };
  }

  async list(
    option?: Partial<{
      category: string;
      alias: string;
      sinse: Date;
      until: Date;
    }>,
  ): Promise<DBEmojis> {
    let cond: undefined | SQL;
    if (option) {
      if (option.category) {
        cond = eq(emojis.category, option.category);
      }
      if (option.sinse) {
        const sinseCond = gte(emojis.updatedAt, option.sinse);

        if (cond) {
          cond = and(cond, sinseCond);
        } else {
          cond = sinseCond;
        }
      }
      if (option.until) {
        const untilCond = lt(emojis.updatedAt, option.until);

        if (cond) {
          cond = and(cond, untilCond);
        } else {
          cond = untilCond;
        }
      }
    }

    const result = await this.db
      .select({
        emoji: emojis,
        alias: aliases.alias,
      })
      .from(emojis)
      .leftJoin(aliases, eq(emojis.name, aliases.name))
      .where(cond);
    const emojisResult = this.toEmojiAndAliases(result);

    return option?.alias
      ? emojisResult.filter((emoji) =>
          emoji.aliases.some((alias) => alias === option.alias),
        )
      : emojisResult;
  }

  async save(input: {
    name: string;
    category: string | null;
    url: string;
    aliases: string[];
    updatedAt?: Date;
  }): Promise<
    | {
        result: "ok";
        value: DBEmoji;
      }
    | {
        result: "err";
        error: string;
      }
  > {
    const oldAliases = await this.db
      .select({
        alias: aliases.alias,
      })
      .from(aliases)
      .where(eq(aliases.name, input.name))
      .all()
      .then((result) => result.map((row) => row.alias));
    const toDelete = oldAliases.filter(
      (oldAlias) => !input.aliases.includes(oldAlias),
    );
    const toInsert = input.aliases.filter(
      (alias) => !oldAliases.includes(alias),
    );

    await this.db.batch([
      this.db
        .insert(emojis)
        .values(input)
        .onConflictDoUpdate({
          target: emojis.name,
          set: {
            category: input.category,
            url: input.url,
            updatedAt: input.updatedAt ?? new Date(),
          },
        }),
      ...toInsert.map((alias) =>
        this.db
          .insert(aliases)
          .values({ name: input.name, alias })
          .onConflictDoNothing(),
      ),
      ...toDelete.map((alias) =>
        this.db
          .delete(aliases)
          .where(and(eq(aliases.name, input.name), eq(aliases.alias, alias))),
      ),
    ]);

    return await this.get(input.name);
  }

  async delete(name: string): Promise<
    | {
        result: "ok";
        value: DBEmoji;
      }
    | {
        result: "err";
        error: string;
      }
  > {
    const toDelete = await this.get(name);
    if (toDelete.result === "err") {
      return toDelete;
    }

    try {
      await this.db.delete(emojis).where(eq(emojis.name, name)).execute();
    } catch (e) {
      return {
        result: "err",
        error: (e as Error).message,
      };
    }

    return toDelete;
  }
}
