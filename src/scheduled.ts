import { Temporal } from "@js-temporal/polyfill";
import { DBEmoji, EmojiResponse, Env } from "./types";

export const scheduled = async (
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
) => {
  // Misskeyのカスタム絵文字を取得
  const mkEmojisURL = new URL("/api/emojis", env.MK_URL);
  const res = await fetch(mkEmojisURL.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const serverEmojis = ((await res.json()) as EmojiResponse).emojis;
  serverEmojis.map((emoji, emojiIndex) => {
    serverEmojis[emojiIndex].aliases = emoji.aliases.filter(
      (alias) => alias.trim().length > 0,
    );
  });

  // 最終更新日時を取得
  const lastUpdated = await env.KV.get("last-updated");
  if (lastUpdated === null) {
    // 更新日時を設定
    const updatedAt = Temporal.Now.plainDateTimeISO().toString();

    // カスタム絵文字をR２に保存
    await Promise.all(
      serverEmojis.map(async (emoji) => {
        const res = await fetch(emoji.url);
        await env.BUCKET.put(`${emoji.name}-${updatedAt}`, await res.blob());
      }),
    );

    // 絵文字の情報をD1に保存
    const emojiStms = env.DB.prepare(
      "INSERT INTO emojis (name, url, category, updated_at) VALUES (?, ?, ?, ?)",
    );
    const aliasesStms = env.DB.prepare(
      "INSERT INTO emoji_aliases (name, alias) VALUES (?, ?)",
    );
    await env.DB.batch([
      ...serverEmojis.map((emoji) =>
        emojiStms.bind(emoji.name, emoji.url, emoji.category, updatedAt),
      ),
      ...serverEmojis.flatMap((emoji) =>
        emoji.aliases.map((alias) => aliasesStms.bind(emoji.name, alias)),
      ),
    ]);

    // 最終更新日時を保存
    await env.KV.put("last-updated", updatedAt);

    return;
  }

  const { results } = await env.DB.prepare(
    "SELECT emojis.name, category, url, updated_at, GROUP_CONCAT(alias) as aliases FROM emojis LEFT OUTER JOIN emoji_aliases ON emojis.name = emoji_aliases.name GROUP BY emojis.name",
  ).all();
  const dbEmojis: DBEmoji[] = results.map((emoji) => ({
    name: emoji.name as string,
    aliases: (emoji.aliases ? (emoji.aliases as string).split(",") : []).filter(
      (alias) => alias.trim().length > 0,
    ),
    category: emoji.category as string,
    url: emoji.url as string,
    updatedAt: Temporal.PlainDateTime.from(emoji.updated_at as string),
  }));

  // カスタム絵文字の更新をチェック
  const added = [];
  const deleted = [];
  const updated = [];

  for (const emoji of serverEmojis) {
    const index = dbEmojis.findIndex((e) => e.name === emoji.name);
    if (index === -1) {
      added.push(emoji);

      continue;
    }

    const dbEmoji = dbEmojis[index];
    dbEmojis.splice(index, 1);
    if (
      dbEmoji.url !== emoji.url ||
      dbEmoji.category !== emoji.category ||
      dbEmoji.aliases.sort().toString() !== emoji.aliases.sort().toString()
    ) {
      updated.push({ old: dbEmoji, new: emoji });
    }
  }
  deleted.push(...dbEmojis);

  if (added.length === 0 && deleted.length === 0 && updated.length === 0) {
    return;
  }

  // Misskeyで通知
  const mkNoteURL = new URL("/api/notes/create", env.MK_URL);
  const imageBackupURL = new URL(
    env.IMAGE_BACKUP_PATH,
    env.IMAGE_BACKUP_BASE_URL,
  );
  const toRedirectURL = (url: string) =>
    new URL(
      `/redirect?to=${encodeURI(url)}`,
      env.IMAGE_BACKUP_BASE_URL,
    ).toString();
  const addedMessages = added.map(
    (emoji) =>
      `【絵文字追加】\n$[x2 :${emoji.name}:]\n\`:${emoji.name
      }:\`\n\nカテゴリ: ${emoji.category}\nエイリアス: ${emoji.aliases.length > 0 ? emoji.aliases.join(", ") : "[なし]"
      }\n?[画像](${toRedirectURL(emoji.url)})`,
  );
  const updatedMessages = updated.map(({ old: oldEmoji, new: newEmoji }) => {
    let message = `【絵文字更新】\n$[x2 :${newEmoji.name}:]\n\`:${newEmoji.name}:\`\n\n`;
    if (oldEmoji.category !== newEmoji.category) {
      message += `カテゴリ: ${oldEmoji.category} → ${newEmoji.category}\n`;
    }
    if (
      oldEmoji.aliases.sort().toString() !== newEmoji.aliases.sort().toString()
    ) {
      message += `エイリアス: ${oldEmoji.aliases.length > 0 ? oldEmoji.aliases.join(", ") : "[なし]"
        } → ${newEmoji.aliases.length > 0 ? newEmoji.aliases.join(", ") : "[なし]"
        }\n`;
    }
    if (oldEmoji.url !== newEmoji.url) {
      const emojiBackupURL = new URL(
        `${oldEmoji.name}-${oldEmoji.updatedAt
          .toString()
          .replaceAll(":", "-")}`,
        imageBackupURL,
      );

      message += `?[旧画像](${toRedirectURL(
        oldEmoji.url,
      )}) → ?[画像](${toRedirectURL(
        newEmoji.url,
      )})\n旧画像が見れない場合はこちら: ?[旧画像バックアップ](${emojiBackupURL.toString()})`;
    }

    return message;
  });
  const deletedMessages = deleted.map((emoji) => {
    const emojiBackupURL = new URL(
      `${emoji.name}-${emoji.updatedAt.toString().replaceAll(":", "-")}`,
      imageBackupURL,
    );

    return `【絵文字削除】\n\`:${emoji.name}:\`\n\nカテゴリ: ${emoji.category
      }\nエイリアス: ${emoji.aliases.length > 0 ? emoji.aliases.join(", ") : "[なし]"
      }\n?[画像](${toRedirectURL(
        emoji.url,
      )})\n画像が見れない場合はこちら: ?[画像バックアップ](${emojiBackupURL.toString()})`;
  });

  const addedEmojiStms = env.DB.prepare(
    "INSERT INTO emojis (name, url, category, updated_at) VALUES (?1, ?2, ?3, ?4) on conflict(name) do update set url = ?2, category = ?3, updated_at = ?4",
  );
  const addedEmojiAliasesStms = env.DB.prepare(
    "INSERT INTO emoji_aliases (name, alias) VALUES (?1, ?2) on conflict(name, alias) do nothing",
  );
  const deletedEmojiStms = env.DB.prepare("DELETE FROM emojis WHERE name = ?");
  const deletedEmojiAliasesStms = env.DB.prepare(
    "DELETE FROM emoji_aliases WHERE name = ?1 AND alias = ?2",
  );
  const updatedAt = Temporal.Now.plainDateTimeISO().toString();

  console.log(added, updated, deleted);

  await Promise.all([
    ...added.map(async (emoji) => {
      const res = await fetch(emoji.url);
      await env.BUCKET.put(
        `${emoji.name}-${updatedAt.replaceAll(":", "-")}`,
        await res.blob(),
      );
    }),
    env.DB.batch([
      ...[...added, ...updated.map(({ new: emoji }) => emoji)].map((emoji) =>
        addedEmojiStms.bind(emoji.name, emoji.url, emoji.category, updatedAt),
      ),
      ...added.flatMap((emoji) =>
        emoji.aliases.map((alias) =>
          addedEmojiAliasesStms.bind(emoji.name, alias),
        ),
      ),
      ...updated.flatMap(({ new: newEmoji, old: oldEmoji }) => {
        const addedAliases = newEmoji.aliases.filter(
          (alias) => !oldEmoji.aliases.includes(alias),
        );
        const deletedAliases = oldEmoji.aliases.filter(
          (alias) => !newEmoji.aliases.includes(alias),
        );

        return [
          ...addedAliases.map((alias) =>
            addedEmojiAliasesStms.bind(newEmoji.name, alias),
          ),
          ...deletedAliases.map((alias) =>
            deletedEmojiAliasesStms.bind(oldEmoji.name, alias),
          ),
        ];
      }),
      ...deleted.map((emoji) => deletedEmojiStms.bind(emoji.name)),
      ...deleted.flatMap((emoji) =>
        emoji.aliases.map((alias) => deletedEmojiAliasesStms.bind(emoji.name, alias)),
      ),
    ]),
    ...added.map(async (emoji) => {
      const res = await fetch(emoji.url);
      await env.BUCKET.put(
        `${emoji.name}-${updatedAt.replaceAll(":", "-")}`,
        await res.blob(),
      );
    }),
    ...updated.map(async ({ new: newEmoji }) => {
      const res = await fetch(newEmoji.url);
      await env.BUCKET.put(
        `${newEmoji.name}-${updatedAt.replaceAll(":", "-")}`,
        await res.blob(),
      );
    }),
  ]);

  await Promise.all([
    [...addedMessages, ...updatedMessages, ...deletedMessages].map(
      async (message) => {
        await fetch(mkNoteURL.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            i: env.MK_TOKEN,
            visibility: "public",
            text: message,
          }),
        });
      },
    ),
  ]);

  await env.KV.put("last-updated", updatedAt);
};
